'use strict';
require('dotenv').config();
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const ExcelJS = require('exceljs');
const { pool } = require('../config/database');
const { hashToken } = require('../utils');
const { claveConfigurada, cifrarCodigo, descifrarCodigo } = require('../utils/codigo-invitacion');

const filename = process.argv.find(arg => arg.startsWith('--file='))?.slice('--file='.length) || 'export_1.xlsx';
if (!/^export_[1-9]\d*\.xlsx$/.test(filename)) throw Error('Usa un archivo export_N.xlsx de private/imports.');
const inputPath = path.join(__dirname, '../private/imports', filename);
const headers = ['Nombre(s)', 'Apellido paterno', 'Apellido materno', 'CURP', 'Edad', 'Teléfono', 'Correo electrónico', 'Distrito', 'Cabecera', 'Sección', 'Referente nombre(s)', 'Referente apellido paterno', 'Referente apellido materno', 'Responsible', 'Código de invitación'];
const clean = value => String(value ?? '').trim().replace(/\s+/g, ' ');
const keyPart = value => clean(value).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleUpperCase('es-MX');
const identityKey = values => [0, 1, 2, 5, 7, 9, 10, 11, 12].map(index => keyPart(values[index])).join('|');
const existingKey = record => [record.nombre, record.apellido_paterno, record.apellido_materno, record.telefono, record.distrito_numero, record.seccion_electoral, record.referente_nombre, record.referente_apellido_paterno, record.referente_apellido_materno].map(keyPart).join('|');

async function readSource() {
  const bytes = await fs.readFile(inputPath);
  const fileHash = crypto.createHash('sha256').update(bytes).digest('hex');
  const publicPath = path.join(__dirname, '../public/assests', filename);
  const publicBytes = await fs.readFile(publicPath).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
  if (publicBytes && crypto.createHash('sha256').update(publicBytes).digest('hex') !== fileHash) throw Error('El Excel original cambió después de crear la copia privada. Vuelve a revisarlo antes de importar.');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  if (workbook.worksheets.length !== 1) throw Error('El archivo debe tener una sola hoja de datos.');
  const sheet = workbook.worksheets[0];
  if (headers.some((header, index) => {
    const actual = clean(sheet.getRow(1).getCell(index + 1).value);
    return actual !== header && !(index === 13 && actual === 'Responsable');
  })) throw Error('Los encabezados del Excel cambiaron.');
  const rows = [];
  for (let number = 2; number <= sheet.rowCount; number++) {
    const cells = headers.map((_, index) => sheet.getRow(number).getCell(index + 1));
    if (cells.some(cell => cell.type === ExcelJS.ValueType.Formula || cell.type === ExcelJS.ValueType.Hyperlink)) throw Error(`Fórmula o vínculo no permitido en la fila ${number}.`);
    const values = cells.map(cell => clean(cell.value));
    if (!values.some(Boolean)) continue;
    rows.push({ number, values });
  }
  if (!rows.length) throw Error('El Excel no tiene filas de datos.');
  return { rows, fileHash };
}

async function checkData(client, source, apply) {
  const codes = new Set(source.rows.map(row => row.values[14].toUpperCase()));
  if (codes.size !== 1) throw Error('El Excel debe contener un solo código de invitación.');
  const code = [...codes][0];
  if (!/^[0-9A-F]{4}(?:-[0-9A-F]{4}){3}$/.test(code)) throw Error('El código de invitación no tiene el formato válido.');
  const invitations = await client.query(`SELECT id,codigo_hash,codigo_cifrado,invitador_nombre,estado,vence_en,eliminado_en,max_usos,usos
   FROM invitaciones WHERE codigo_hash=$1 ${apply ? 'FOR UPDATE' : ''}`, [hashToken(code)]);
  if (invitations.rowCount !== 1) throw Error('El código no corresponde a una invitación única en la base de datos.');
  const invitation = invitations.rows[0];
  if (invitation.estado !== 'pendiente' || invitation.eliminado_en || (invitation.vence_en && new Date(invitation.vence_en) <= new Date())) throw Error('La invitación ya no está activa.');
  if (invitation.codigo_cifrado && descifrarCodigo(invitation.codigo_cifrado, invitation.id) !== code) throw Error('El respaldo cifrado del código no coincide.');
  if (!claveConfigurada()) throw Error('Falta la llave para respaldar el código cifrado.');
  const badOwner = source.rows.find(row => keyPart(row.values[13]) !== keyPart(invitation.invitador_nombre));
  if (badOwner) throw Error(`Responsable distinto del registrado para el código en la fila ${badOwner.number}.`);
  const districts = await client.query('SELECT numero,cabecera FROM distritos_federales');
  const districtMap = new Map(districts.rows.map(item => [String(item.numero), item.cabecera]));
  const issues = { phone: [], section: [], blankPhone: [], blankSection: [] };
  const seen = new Set();
  const maxLengths = [100, 100, 100, 18, 3, 20, 254, 2, 140, 10, 100, 100, 100, 250, 19];
  for (const row of source.rows) {
    const v = row.values;
    for (let index = 0; index < headers.length; index++) if (v[index].length > maxLengths[index]) throw Error(`Texto demasiado largo en fila ${row.number}, columna ${headers[index]}.`);
    for (const index of [0, 1, 10, 11]) if (!v[index]) throw Error(`Falta ${headers[index]} en la fila ${row.number}.`);
    if (v[3] || v[4] || v[6]) throw Error(`CURP, edad o correo contienen valores inesperados en fila ${row.number}.`);
    if (!districtMap.has(v[7])) throw Error(`Distrito inexistente en fila ${row.number}.`);
    if (v[8] && keyPart(v[8]) !== keyPart(districtMap.get(v[7]))) throw Error(`Cabecera distinta del catálogo en fila ${row.number}.`);
    if (!v[5]) issues.blankPhone.push(row.number);
    else if (!/^\d{10}$/.test(v[5])) issues.phone.push(row.number);
    if (!v[9]) issues.blankSection.push(row.number);
    else if (!/^\d{1,4}$/.test(v[9])) issues.section.push(row.number);
    const key = identityKey(v);
    if (seen.has(key)) throw Error(`Fila duplicada dentro del Excel: ${row.number}.`);
    seen.add(key);
  }
  if (issues.section.length) throw Error(`Sección inválida en filas ${issues.section.join(', ')}.`);
  const existing = await client.query(`SELECT nombre,apellido_paterno,apellido_materno,telefono,distrito_numero,seccion_electoral,
   referente_nombre,referente_apellido_paterno,referente_apellido_materno
   FROM inscripciones WHERE invitacion_id=$1 AND eliminado_en IS NULL`, [invitation.id]);
  const existingKeys = new Set(existing.rows.map(existingKey));
  const pending = source.rows.filter(row => !existingKeys.has(identityKey(row.values)));
  if (invitation.max_usos !== null && Number(invitation.usos) + pending.length > Number(invitation.max_usos)) throw Error('La importación excedería el máximo de usos de la invitación.');
  return { invitation, code, districtMap, pending, alreadyPresent: source.rows.length - pending.length, issues };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const probe = process.argv.includes('--probe');
  if (apply && probe) throw Error('Usa --apply o --probe, no ambos.');
  const write = apply || probe;
  const source = await readSource();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!write) await client.query('SET TRANSACTION READ ONLY');
    const checked = await checkData(client, source, write);
    let inserted = 0;
    if (write) {
      const migration = await fs.readFile(path.join(__dirname, '../database/10_importacion_historica.sql'), 'utf8');
      await client.query(migration);
      for (const row of checked.pending) {
        const v = row.values;
        const importKey = crypto.createHash('sha256').update(JSON.stringify([checked.invitation.id, identityKey(v)])).digest('hex');
        const result = await client.query(`INSERT INTO inscripciones
         (invitacion_id,nombre,apellido_paterno,apellido_materno,curp,edad,telefono,correo_electronico,distrito_numero,seccion_electoral,
          referente_nombre,referente_apellido_paterno,referente_apellido_materno,origen,importacion_clave,importacion_archivo,importacion_fila)
         VALUES($1,$2,$3,$4,NULL,NULL,$5,NULL,$6,$7,$8,$9,$10,'importacion',$11,$12,$13)
         ON CONFLICT (importacion_clave) WHERE importacion_clave IS NOT NULL DO NOTHING RETURNING id`,
         [checked.invitation.id,v[0],v[1],v[2],v[5] || null,Number(v[7]),v[9] || null,v[10],v[11],v[12] || null,importKey,source.fileHash,row.number]);
        inserted += result.rowCount;
      }
      if (inserted) {
        await client.query('UPDATE invitaciones SET usos=usos+$2,utilizada_en=COALESCE(utilizada_en,now()) WHERE id=$1', [checked.invitation.id,inserted]);
      }
      if (!checked.invitation.codigo_cifrado) {
        await client.query('UPDATE invitaciones SET codigo_cifrado=$2 WHERE id=$1', [checked.invitation.id,cifrarCodigo(checked.code,checked.invitation.id)]);
      }
      const verified = await client.query('SELECT count(*)::int AS total FROM inscripciones WHERE invitacion_id=$1 AND eliminado_en IS NULL', [checked.invitation.id]);
      if (verified.rows[0].total !== Number(checked.invitation.usos) + inserted) throw Error('El conteo final de inscripciones no coincide con el contador de la invitación.');
      await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    } else await client.query('ROLLBACK');
    const schema = await client.query(`SELECT EXISTS(SELECT 1 FROM information_schema.columns
     WHERE table_schema=current_schema() AND table_name='inscripciones' AND column_name='origen') AS ready`);
    const verification = schema.rows[0].ready
      ? await client.query(`SELECT count(*)::int AS total,
       count(*) FILTER (WHERE s.origen='importacion')::int AS imported,
       count(*) FILTER (WHERE s.importacion_archivo=$2)::int AS from_this_file,
       count(*) FILTER (WHERE d.cabecera IS NULL)::int AS without_cabecera
       FROM inscripciones s LEFT JOIN distritos_federales d ON d.numero=s.distrito_numero
       WHERE s.invitacion_id=$1 AND s.eliminado_en IS NULL`, [checked.invitation.id,source.fileHash])
      : await client.query(`SELECT count(*)::int AS total FROM inscripciones WHERE invitacion_id=$1 AND eliminado_en IS NULL`, [checked.invitation.id]);
    console.log(JSON.stringify({ file: filename, mode: apply ? 'applied' : probe ? 'probe-rolled-back' : 'dry-run', sourceRows: source.rows.length, invitationId: checked.invitation.id, alreadyPresent: checked.alreadyPresent, pending: checked.pending.length, inserted, cabecerasFromCatalog: checked.districtMap.size, review: checked.issues, verification: verification.rows[0] }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); await pool.end(); }
}

main().catch(error => { console.error('Importación cancelada:', error.message); process.exitCode = 1; });
