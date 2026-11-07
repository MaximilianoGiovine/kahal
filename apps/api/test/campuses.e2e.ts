/**
 * Prueba de punta a punta de las sedes contra una API levantada de verdad.
 *
 *   API_URL=http://localhost:4000/api DATABASE_URL=... JWT_SECRET=... npm run test:campuses
 *
 * Crea y borra sus propias iglesias, pero usa solo una base de pruebas: nunca la de producción.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { Permission, PrismaClient, UserStatus } from '@prisma/client';
import ExcelJS from 'exceljs';

const API = process.env.API_URL ?? 'http://localhost:4000/api';
const db = new PrismaClient();
const jwt = new JwtService({ secret: process.env.JWT_SECRET });
const tag = randomBytes(4).toString('hex');

type Res = { status: number; body: any; raw: Response };

function client(token: string, headers: Record<string, string> = {}) {
  const call = async (method: string, path: string, body?: unknown): Promise<Res> => {
    const raw = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined && { 'Content-Type': 'application/json' }), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const isJson = raw.headers.get('content-type')?.includes('json');
    return { status: raw.status, raw, body: isJson ? await raw.clone().json() : undefined };
  };
  return {
    get: (p: string) => call('GET', p),
    post: (p: string, b: unknown = {}) => call('POST', p, b),
    patch: (p: string, b: unknown) => call('PATCH', p, b),
    put: (p: string, b: unknown) => call('PUT', p, b),
    del: (p: string) => call('DELETE', p),
  };
}
type Client = ReturnType<typeof client>;

const ids = (list: { id: string }[]) => list.map((x) => x.id).sort();
const same = (a: string[], b: string[]) => assert.deepEqual([...a].sort(), [...b].sort());

async function makeUser(churchId: string, name: string, roleIds: string[], extra: { isSuperAdmin?: boolean } = {}) {
  const user = await db.user.create({
    data: {
      churchId: extra.isSuperAdmin ? null : churchId,
      isSuperAdmin: extra.isSuperAdmin ?? false,
      email: `${name}-${tag}@sedes.test`,
      firstName: name,
      lastName: 'Prueba',
      status: UserStatus.ACTIVE,
      roles: { create: roleIds.map((roleId) => ({ roleId })) },
    },
  });
  return { user, api: client(await jwt.signAsync({ sub: user.id }, { expiresIn: '1h' })) };
}

async function sheetRows(res: Res, sheet: string) {
  assert.equal(res.status, 200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await res.raw.arrayBuffer());
  const rows: string[] = [];
  wb.getWorksheet(sheet)!.eachRow((r) => rows.push(JSON.stringify(r.values)));
  return rows.join('\n');
}

describe('sedes', () => {
  let churchA: string, churchB: string;
  let admin: Client, otherChurchAdmin: Client, wholeTreasurer: Client, norteStaff: Client, superAdmin: Client, plainMember: Client;
  let adminRole: string, staffRole: string, adminBId: string;
  let norteStaffId: string;
  let norte: string, sur: string, campusB: string;
  let memberNorte: string, memberSur: string, memberNone: string;
  let accountNorte: string, accountSur: string, accountGeneral: string, categoryIncome: string, categoryExpense: string;
  let txNorte: string, txSur: string, txGeneral: string;
  let statusId: string, ministryId: string, familyMixed: string, familyNorte: string;

  before(async () => {
    const [a, b] = await Promise.all([
      db.church.create({ data: { name: `A ${tag}`, slug: `a-${tag}`, billingExempt: true } }),
      db.church.create({ data: { name: `B ${tag}`, slug: `b-${tag}`, billingExempt: true } }),
    ]);
    churchA = a.id;
    churchB = b.id;
    adminRole = (await db.churchRole.create({ data: { churchId: churchA, name: 'Admin', isAdmin: true } })).id;
    const adminBRole = await db.churchRole.create({ data: { churchId: churchB, name: 'Admin', isAdmin: true } });
    // El rol incluye a propósito permisos de toda la iglesia: el límite por sede debe anularlos.
    staffRole = (
      await db.churchRole.create({
        data: {
          churchId: churchA,
          name: 'Responsable',
          permissions: [
            Permission.MEMBERS_VIEW, Permission.MEMBERS_EDIT, Permission.MEMBERS_DELETE, Permission.MEMBER_STATUSES_MANAGE,
            Permission.FINANCE_VIEW, Permission.FINANCE_EDIT, Permission.USERS_VIEW, Permission.USERS_MANAGE,
            Permission.ROLES_MANAGE, Permission.CHURCH_SETTINGS,
          ],
        },
      })
    ).id;
    const treasurerRole = await db.churchRole.create({ data: { churchId: churchA, name: 'Tesorería', permissions: [Permission.FINANCE_VIEW, Permission.FINANCE_EDIT, Permission.MEMBERS_VIEW] } });

    admin = (await makeUser(churchA, 'admin', [adminRole])).api;
    const adminB = await makeUser(churchB, 'adminb', [adminBRole.id]);
    otherChurchAdmin = adminB.api;
    adminBId = adminB.user.id;
    wholeTreasurer = (await makeUser(churchA, 'tesorero', [treasurerRole.id])).api;
    const staff = await makeUser(churchA, 'norte', [staffRole]);
    norteStaff = staff.api;
    norteStaffId = staff.user.id;
    plainMember = (await makeUser(churchA, 'miembro', [])).api;
    const sa = await makeUser(churchA, 'super', [], { isSuperAdmin: true });
    superAdmin = client(await jwt.signAsync({ sub: sa.user.id }, { expiresIn: '1h' }), { 'x-church-id': churchA });

    categoryIncome = (await db.financeCategory.create({ data: { churchId: churchA, name: 'Ofrendas', type: 'INCOME', isTithe: true } })).id;
    categoryExpense = (await db.financeCategory.create({ data: { churchId: churchA, name: 'Luz', type: 'EXPENSE' } })).id;
    accountGeneral = (await db.financeAccount.create({ data: { churchId: churchA, name: 'Caja', currency: 'ARS', initialBalance: 1000 } })).id;
    statusId = (await db.memberStatus.create({ data: { churchId: churchA, name: 'Miembro' } })).id;
    ministryId = (await db.ministry.create({ data: { churchId: churchA, name: 'Música' } })).id;
  });

  after(async () => {
    await db.transaction.deleteMany({ where: { churchId: { in: [churchA, churchB] } } });
    await db.church.deleteMany({ where: { id: { in: [churchA, churchB] } } });
    await db.user.deleteMany({ where: { email: { endsWith: `-${tag}@sedes.test` } } });
    await db.$disconnect();
  });

  describe('con la opción apagada', () => {
    it('la iglesia funciona como siempre y no acepta sedes', async () => {
      assert.deepEqual((await admin.get('/campuses')).body, { enabled: false, separated: [], items: [] });
      const public_ = await client('x').get(`/public/churches/a-${tag}`);
      assert.deepEqual(public_.body.campuses, []);
      const created = await admin.post('/members', { firstName: 'Sin', lastName: 'Sede' });
      assert.equal(created.status, 201);
      assert.equal(created.body.campusId, null);
      await db.member.delete({ where: { id: created.body.id } });
    });

    it('no se puede limitar a un usuario a una sede', async () => {
      const c = await db.campus.create({ data: { churchId: churchA, name: `Temp ${tag}` } });
      const res = await admin.patch(`/users/${norteStaffId}`, { campusRestricted: true, campusIds: [c.id] });
      assert.equal(res.status, 400);
      const member = await admin.post('/members', { firstName: 'X', lastName: 'Y', campusId: c.id });
      assert.equal(member.status, 400);
      await db.campus.delete({ where: { id: c.id } });
    });
  });

  describe('configuración', () => {
    it('solo quien tiene el permiso gestiona las sedes', async () => {
      assert.equal((await plainMember.put('/campuses/settings', { enabled: true })).status, 403);
      assert.equal((await plainMember.post('/campuses', { name: 'Hack' })).status, 403);
      assert.equal((await plainMember.get('/campuses/manage')).status, 403);
    });

    it('se activa y se crean sedes con nombres únicos', async () => {
      assert.deepEqual((await admin.put('/campuses/settings', { enabled: true })).body, { enabled: true, separated: ['MEMBERS', 'FINANCE'] });
      norte = (await admin.post('/campuses', { name: 'Norte', city: 'Córdoba' })).body.id;
      sur = (await admin.post('/campuses', { name: 'Sur' })).body.id;
      assert.ok(norte && sur);
      assert.equal((await admin.post('/campuses', { name: '  norte ' })).status, 409);
      assert.equal((await admin.patch(`/campuses/${sur}`, { name: 'NORTE' })).status, 409);
      assert.equal((await admin.patch(`/campuses/${sur}`, { name: 'Sur' })).status, 200);
      assert.equal((await superAdmin.get('/campuses')).body.items.length, 2);
    });

    it('la dirección de la sede no sale en la página pública', async () => {
      await admin.patch(`/campuses/${norte}`, { name: 'Norte', city: 'Córdoba', address: 'Calle 1', phone: '123' });
      const { campuses } = (await client('x').get(`/public/churches/a-${tag}`)).body;
      assert.equal(campuses.length, 2);
      assert.deepEqual(Object.keys(campuses[0]).sort(), ['city', 'id', 'name']);
    });

    it('una iglesia no ve ni toca las sedes de otra', async () => {
      await otherChurchAdmin.put('/campuses/settings', { enabled: true });
      campusB = (await otherChurchAdmin.post('/campuses', { name: 'Norte' })).body.id;
      assert.ok(campusB, 'el mismo nombre se puede usar en otra iglesia');
      assert.deepEqual(ids((await otherChurchAdmin.get('/campuses')).body.items), [campusB]);
      assert.equal((await otherChurchAdmin.patch(`/campuses/${norte}`, { name: 'Robada' })).status, 404);
      assert.equal((await otherChurchAdmin.del(`/campuses/${norte}`)).status, 404);
      assert.equal((await otherChurchAdmin.post(`/campuses/${norte}/assign-unassigned`)).status, 404);
    });
  });

  describe('datos de prueba', () => {
    it('miembros y cuentas se asignan a una sede', async () => {
      const make = async (name: string, campusId: string | null) => {
        const res = await admin.post('/members', { firstName: name, lastName: `P${tag}`, email: `${name}-m-${tag}@sedes.test`, campusId, statusIds: [statusId], ministryIds: [ministryId], documentId: `${tag}${name}` });
        assert.equal(res.status, 201);
        assert.equal(res.body.campusId, campusId);
        return res.body.id as string;
      };
      memberNorte = await make('Ana', norte);
      memberSur = await make('Beto', sur);
      memberNone = await make('Caro', null);

      accountNorte = (await admin.post('/finance/accounts', { name: 'Caja', currency: 'ARS', initialBalance: 100, campusId: norte })).body.id;
      accountSur = (await admin.post('/finance/accounts', { name: 'Caja', currency: 'ARS', initialBalance: 200, campusId: sur })).body.id;
      assert.ok(accountNorte && accountSur, 'el mismo nombre de cuenta se repite entre sedes');
      assert.equal((await admin.post('/finance/accounts', { name: 'Caja', campusId: norte })).status, 409, 'pero no dentro de una sede');
      assert.equal((await admin.post('/finance/accounts', { name: 'Caja' })).status, 409, 'ni entre las generales');

      const tx = async (accountId: string, amount: number, memberId?: string, receiptKey?: string) => {
        const res = await admin.post('/finance/transactions', { accountId, categoryId: categoryIncome, amount, date: '2026-11-02', memberId, receiptKey, description: `mov-${amount}` });
        assert.equal(res.status, 201, JSON.stringify(res.body));
        return res.body.id as string;
      };
      txNorte = await tx(accountNorte, 10, memberNorte, `${churchA}/receipt/norte.pdf`);
      txSur = await tx(accountSur, 20, memberSur, `${churchA}/receipt/sur.pdf`);
      txGeneral = await tx(accountGeneral, 40, memberNone, `${churchA}/receipt/general.pdf`);

      familyMixed = (await admin.post('/families', { name: `Mixta ${tag}` })).body.id;
      familyNorte = (await admin.post('/families', { name: `Norte ${tag}` })).body.id;
      const base = { firstName: 'Ana', lastName: `P${tag}` };
      await admin.patch(`/members/${memberNorte}`, { ...base, familyId: familyMixed });
      await admin.patch(`/members/${memberSur}`, { firstName: 'Beto', lastName: `P${tag}`, familyId: familyMixed });
    });
  });

  describe('aislamiento en la base', () => {
    it('la clave foránea impide apuntar a una sede de otra iglesia', async () => {
      await assert.rejects(db.member.update({ where: { id: memberNorte }, data: { campusId: campusB } }));
      await assert.rejects(db.financeAccount.update({ where: { id: accountNorte }, data: { campusId: campusB } }));
    });
    it('la API rechaza una sede de otra iglesia', async () => {
      assert.equal((await admin.post('/members', { firstName: 'X', lastName: 'Y', campusId: campusB })).status, 400);
      assert.equal((await admin.patch(`/members/${memberNorte}`, { firstName: 'Ana', lastName: `P${tag}`, campusId: campusB })).status, 400);
      assert.equal((await admin.post('/finance/accounts', { name: 'Ajena', campusId: campusB })).status, 400);
      assert.equal((await admin.patch(`/users/${norteStaffId}`, { campusRestricted: true, campusIds: [campusB] })).status, 400);
    });
    it('filtrar por una sede ajena no devuelve nada', async () => {
      assert.equal((await otherChurchAdmin.get(`/members?campusId=${norte}`)).body.total, 0);
      assert.equal((await otherChurchAdmin.get(`/finance/transactions?campusId=${norte}`)).body.total, 0);
      assert.deepEqual((await otherChurchAdmin.get(`/finance/accounts?campusId=${norte}`)).body, []);
    });
  });

  describe('quien ve toda la iglesia', () => {
    it('filtra miembros por sede y por sin sede', async () => {
      assert.equal((await admin.get(`/members?q=P${tag}`)).body.total, 3);
      same(ids((await admin.get(`/members?q=P${tag}&campusId=${norte}`)).body.items), [memberNorte]);
      same(ids((await admin.get(`/members?q=P${tag}&campusId=none`)).body.items), [memberNone]);
      assert.equal((await admin.get(`/members/${memberNorte}`)).body.campus.name, 'Norte');
    });

    it('separa las finanzas de cada sede', async () => {
      const summary = (campusId: string) => wholeTreasurer.get(`/finance/summary?from=2026-11-01&to=2026-11-30${campusId && `&campusId=${campusId}`}`);
      assert.equal(Number((await summary('')).body.totals.ARS.income), 70);
      assert.equal(Number((await summary(norte)).body.totals.ARS.income), 10);
      assert.equal(Number((await summary(sur)).body.totals.ARS.income), 20);
      const general = await summary('none');
      assert.equal(Number(general.body.totals.ARS.income), 40);
      same(ids(general.body.accounts), [accountGeneral]);
      assert.equal(Number(general.body.monthly[0].total), 40, 'también el resumen por mes, que usa SQL manual');
      assert.equal(Number((await summary(sur)).body.monthly[0].total), 20);
      same(ids((await wholeTreasurer.get(`/finance/transactions?campusId=${sur}`)).body.items), [txSur]);
      const [account] = (await wholeTreasurer.get(`/finance/accounts?campusId=${norte}`)).body;
      assert.equal(Number(account.balance), 110);
      assert.equal(account.campus.name, 'Norte');
    });

    it('el Excel respeta el filtro de sede', async () => {
      const rows = await sheetRows(await wholeTreasurer.get(`/finance/export?campusId=${norte}`), 'Movimientos');
      assert.match(rows, /mov-10/);
      assert.doesNotMatch(rows, /mov-20|mov-40/);
      assert.match(await sheetRows(await wholeTreasurer.get(`/finance/export?campusId=${norte}`), 'Resumen'), /Sede: Norte/);
      const members = await sheetRows(await admin.get(`/members/export?q=P${tag}&campusId=${sur}`), 'Miembros');
      assert.match(members, /Beto/);
      assert.doesNotMatch(members, /Ana|Caro/);
    });
  });

  describe('quien está limitado a una sede', () => {
    it('no se puede limitar al rol de administración', async () => {
      const staff = await makeUser(churchA, 'adm2', [adminRole]);
      const res = await admin.patch(`/users/${staff.user.id}`, { campusRestricted: true, campusIds: [norte] });
      assert.equal(res.status, 400);
      const restricted = await makeUser(churchA, 'rest', [staffRole]);
      assert.equal((await admin.patch(`/users/${restricted.user.id}`, { campusRestricted: true, campusIds: [norte] })).status, 200);
      assert.equal((await admin.patch(`/users/${restricted.user.id}`, { roleIds: [adminRole] })).status, 400, 'ni dar ese rol a alguien limitado');
      await db.user.delete({ where: { id: restricted.user.id } });
      await db.user.delete({ where: { id: staff.user.id } });
    });

    it('un límite sin sedes se rechaza', async () => {
      assert.equal((await admin.patch(`/users/${norteStaffId}`, { campusRestricted: true })).status, 400);
      assert.equal((await admin.patch(`/users/${norteStaffId}`, { campusRestricted: true, campusIds: [] })).status, 400);
    });

    it('se limita y aplica al instante', async () => {
      assert.equal((await norteStaff.get(`/members?q=P${tag}`)).body.total, 3);
      const res = await admin.patch(`/users/${norteStaffId}`, { campusRestricted: true, campusIds: [norte] });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.campusRestricted, true);
      assert.equal(res.body.campuses[0].campus.name, 'Norte');
      assert.equal((await norteStaff.get(`/members?q=P${tag}`)).body.total, 1);
    });

    it('pierde los permisos sobre toda la iglesia', async () => {
      const me = (await norteStaff.get('/auth/me')).body;
      assert.deepEqual(me.campusScopes.MEMBERS, [norte]);
      assert.deepEqual(me.campusScopes.FINANCE, [norte]);
      for (const p of ['USERS_VIEW', 'USERS_MANAGE', 'ROLES_MANAGE', 'CHURCH_SETTINGS', 'MEMBER_STATUSES_MANAGE']) assert.ok(!me.permissions.includes(p), p);
      assert.equal((await norteStaff.get('/users')).status, 403);
      assert.equal((await norteStaff.patch(`/users/${norteStaffId}`, { campusRestricted: false })).status, 403, 'no puede quitarse el límite');
      assert.equal((await norteStaff.post('/users', { firstName: 'Xx', lastName: 'Yy', email: `x-${tag}@sedes.test`, password: '12345678', roleIds: [] })).status, 403);
      assert.equal((await norteStaff.post('/roles', { name: 'Nuevo', permissions: [] })).status, 403);
      assert.equal((await norteStaff.patch(`/roles/${staffRole}`, { name: 'Responsable', permissions: [] })).status, 403);
      assert.equal((await norteStaff.patch('/church', { name: 'Hackeada' })).status, 403);
      assert.equal((await norteStaff.put('/campuses/settings', { enabled: false })).status, 403);
      assert.equal((await norteStaff.get('/campuses/manage')).status, 403);
      assert.equal((await norteStaff.patch(`/campuses/${sur}`, { name: 'Hack' })).status, 403);
      assert.equal((await norteStaff.post('/member-statuses', { name: 'Hack' })).status, 403);
    });

    it('en sus áreas limitadas solo opera sobre sus sedes', async () => {
      const { campusScopes } = (await norteStaff.get('/auth/me')).body;
      assert.deepEqual(campusScopes.FINANCE, [norte]);
      assert.equal((await norteStaff.get(`/members?campusId=${sur}`)).status, 403);
    });

    it('miembros de otra sede o sin sede son inaccesibles', async () => {
      same(ids((await norteStaff.get(`/members?q=P${tag}`)).body.items), [memberNorte]);
      assert.equal((await norteStaff.get(`/members?campusId=${sur}`)).status, 403);
      assert.equal((await norteStaff.get('/members?campusId=none')).status, 403);
      assert.equal((await norteStaff.get(`/members/stats?campusId=${sur}`)).status, 403);
      assert.equal((await norteStaff.get(`/members/export?campusId=${sur}`)).status, 403);
      for (const id of [memberSur, memberNone]) {
        assert.equal((await norteStaff.get(`/members/${id}`)).status, 404);
        assert.equal((await norteStaff.patch(`/members/${id}`, { firstName: 'Hack', lastName: 'Hack' })).status, 404);
        assert.equal((await norteStaff.del(`/members/${id}`)).status, 404);
      }
      assert.equal((await db.member.findUnique({ where: { id: memberSur } }))?.firstName, 'Beto');
    });

    it('la búsqueda y las estadísticas no filtran datos de otras sedes', async () => {
      assert.deepEqual((await norteStaff.get(`/members/lookup?q=Beto ${`P${tag}`}`)).body, []);
      assert.deepEqual(ids((await norteStaff.get(`/members/lookup?q=P${tag}`)).body), [memberNorte]);
      const adminStats = (await admin.get(`/members/stats`)).body;
      const stats = (await norteStaff.get('/members/stats')).body;
      assert.equal(stats.total, 1);
      assert.ok(adminStats.total >= 3);
      assert.equal(stats.byStatus.find((s: any) => s.id === statusId).count, 1);
      assert.equal((await norteStaff.get('/member-statuses')).body.find((s: any) => s.id === statusId)._count.members, 1);
      assert.equal((await norteStaff.get('/ministries')).body.find((m: any) => m.id === ministryId)._count.members, 1);
      assert.equal((await norteStaff.get('/dashboard')).body.people.members, 1);
    });

    it('en una familia compartida solo ve a los suyos y no puede cambiarla', async () => {
      const families = (await norteStaff.get('/families')).body;
      const mixed = families.find((f: any) => f.id === familyMixed);
      same(ids(mixed.members), [memberNorte]);
      assert.equal((await norteStaff.patch(`/families/${familyMixed}`, { name: 'Hack' })).status, 403);
      assert.equal((await norteStaff.del(`/families/${familyMixed}`)).status, 403);
      assert.equal((await norteStaff.patch(`/families/${familyNorte}`, { name: `Norte2 ${tag}` })).status, 200);
      const detail = (await norteStaff.get(`/members/${memberNorte}`)).body;
      same(ids(detail.family.members), [memberNorte]);
    });

    it('crea miembros solo en su sede', async () => {
      const created = await norteStaff.post('/members', { firstName: 'Nuevo', lastName: 'Norte' });
      assert.equal(created.status, 201);
      assert.equal(created.body.campusId, norte, 'con una sola sede se asigna sola');
      assert.equal((await norteStaff.post('/members', { firstName: 'X', lastName: 'Y', campusId: sur })).status, 403);
      assert.equal((await norteStaff.patch(`/members/${created.body.id}`, { firstName: 'N', lastName: 'N', campusId: sur })).status, 403, 'no la pasa a otra sede');
      assert.equal((await norteStaff.patch(`/members/${created.body.id}`, { firstName: 'N', lastName: 'N', campusId: null })).status, 403, 'ni la deja sin sede');
      assert.equal((await norteStaff.del(`/members/${created.body.id}`)).status, 200);
    });

    it('los catálogos comunes son de solo lectura', async () => {
      assert.equal((await norteStaff.post('/ministries', { name: 'Hack' })).status, 403);
      assert.equal((await norteStaff.patch(`/ministries/${ministryId}`, { name: 'Hack' })).status, 403);
      assert.equal((await norteStaff.del(`/ministries/${ministryId}`)).status, 403);
      assert.equal((await norteStaff.post('/finance/categories', { name: 'Hack', type: 'INCOME' })).status, 403);
      assert.equal((await norteStaff.patch(`/finance/categories/${categoryIncome}`, { name: 'Hack', type: 'INCOME' })).status, 403);
    });

    it('finanzas: solo ve lo de sus cuentas', async () => {
      same(ids((await norteStaff.get('/finance/accounts')).body), [accountNorte]);
      same(ids((await norteStaff.get('/finance/transactions')).body.items), [txNorte]);
      assert.equal(Number((await norteStaff.get('/finance/transactions')).body.totals.income), 10);
      const summary = (await norteStaff.get('/finance/summary?from=2026-11-01&to=2026-11-30')).body;
      assert.equal(Number(summary.totals.ARS.income), 10);
      same(ids(summary.accounts), [accountNorte]);
      assert.equal(Number(summary.monthly[0].total), 10);
      assert.equal((await norteStaff.get(`/finance/summary?campusId=${sur}`)).status, 403);
      assert.equal((await norteStaff.get('/finance/summary?campusId=none')).status, 403);
      assert.equal((await norteStaff.get(`/finance/accounts?campusId=${sur}`)).status, 403);
      assert.equal((await norteStaff.get(`/finance/transactions?campusId=${sur}`)).status, 403);
      assert.equal((await norteStaff.get(`/finance/transactions?accountId=${accountSur}`)).body.total, 0, 'filtrar por una cuenta ajena no la expone');
      assert.equal((await norteStaff.get(`/finance/transactions?memberId=${memberSur}`)).body.total, 0);
      assert.equal(Number((await norteStaff.get('/dashboard')).body.finance.rows[0].total), 10);
      const category = (await norteStaff.get('/finance/categories')).body.find((c: any) => c.id === categoryIncome);
      assert.equal(category._count.transactions, 1);
    });

    it('finanzas: el Excel no incluye otras sedes', async () => {
      const res = await norteStaff.get('/finance/export');
      const rows = await sheetRows(res, 'Movimientos');
      assert.match(rows, /mov-10/);
      assert.doesNotMatch(rows, /mov-20|mov-40/);
      const resumen = await sheetRows(await norteStaff.get('/finance/export'), 'Resumen');
      assert.doesNotMatch(resumen, /General/);
      assert.equal((await norteStaff.get(`/finance/export?campusId=${sur}`)).status, 403);
    });

    it('finanzas: no opera sobre movimientos ni cuentas de otras sedes', async () => {
      const body = { accountId: accountNorte, categoryId: categoryIncome, amount: 1, date: '2026-11-03' };
      assert.equal((await norteStaff.post('/finance/transactions', { ...body, accountId: accountSur })).status, 400);
      assert.equal((await norteStaff.post('/finance/transactions', { ...body, accountId: accountGeneral })).status, 400);
      assert.equal((await norteStaff.post('/finance/transactions', { ...body, memberId: memberSur })).status, 400, 'ni asociar a una persona de otra sede');
      for (const id of [txSur, txGeneral]) {
        assert.equal((await norteStaff.patch(`/finance/transactions/${id}`, body)).status, 404);
        assert.equal((await norteStaff.del(`/finance/transactions/${id}`)).status, 404);
      }
      assert.equal((await norteStaff.patch(`/finance/transactions/${txNorte}`, { ...body, memberId: memberNorte, accountId: accountSur })).status, 400, 'no lo saca de su sede');
      assert.equal((await norteStaff.patch(`/finance/accounts/${accountSur}`, { name: 'Hack' })).status, 404);
      assert.equal((await norteStaff.patch(`/finance/accounts/${accountGeneral}`, { name: 'Hack' })).status, 404);
      assert.equal((await norteStaff.patch(`/finance/accounts/${accountNorte}`, { name: 'Caja', campusId: sur })).status, 403);
      assert.equal((await norteStaff.patch(`/finance/accounts/${accountNorte}`, { name: 'Caja', campusId: null })).status, 403);
      assert.equal((await norteStaff.post('/finance/accounts', { name: 'Hack', campusId: sur })).status, 403);

      const created = await norteStaff.post('/finance/transactions', body);
      assert.equal(created.status, 201);
      assert.equal((await norteStaff.del(`/finance/transactions/${created.body.id}`)).status, 200);
      const account = await norteStaff.post('/finance/accounts', { name: 'Banco' });
      assert.equal(account.status, 201);
      assert.equal(account.body.campusId, norte);
      await db.financeAccount.delete({ where: { id: account.body.id } });
    });

    it('el aporte de una persona de otra sede se conserva al editar', async () => {
      await admin.patch(`/finance/transactions/${txNorte}`, { accountId: accountNorte, categoryId: categoryIncome, amount: 10, date: '2026-11-02', memberId: memberSur, description: 'mov-10' });
      const res = await norteStaff.patch(`/finance/transactions/${txNorte}`, { accountId: accountNorte, categoryId: categoryIncome, amount: 10, date: '2026-11-02', memberId: memberSur, description: 'mov-10' });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      await admin.patch(`/finance/transactions/${txNorte}`, { accountId: accountNorte, categoryId: categoryIncome, amount: 10, date: '2026-11-02', memberId: memberNorte, description: 'mov-10' });
    });

    it('en la ficha solo ve los aportes de sus cuentas', async () => {
      await admin.post('/finance/transactions', { accountId: accountSur, categoryId: categoryIncome, amount: 5, date: '2026-11-04', memberId: memberNorte });
      assert.equal((await admin.get(`/members/${memberNorte}`)).body.giving.length, 2);
      assert.equal((await norteStaff.get(`/members/${memberNorte}`)).body.giving.length, 1);
    });

    it('no abre comprobantes de otras sedes conociendo la URL', async () => {
      assert.equal((await norteStaff.get(`/files/${churchA}/receipt/sur.pdf`)).status, 403);
      assert.equal((await norteStaff.get(`/files/${churchA}/receipt/general.pdf`)).status, 403);
      // El propio pasa el control; el archivo no existe en disco, así que no debe ser un 403.
      assert.notEqual((await norteStaff.get(`/files/${churchA}/receipt/norte.pdf`)).status, 403);
    });

    it('sin sedes en su lista no ve nada: falla cerrado', async () => {
      await db.userCampus.deleteMany({ where: { userId: norteStaffId } });
      assert.equal((await norteStaff.get('/members')).body.total, 0);
      assert.deepEqual((await norteStaff.get('/finance/accounts')).body, []);
      assert.equal((await norteStaff.get('/finance/transactions')).body.total, 0);
      assert.deepEqual((await norteStaff.get('/finance/summary')).body.monthly, []);
      assert.equal((await norteStaff.get('/dashboard')).body.finance.rows.length, 0);
      assert.deepEqual((await norteStaff.get('/auth/me')).body.campusScopes.MEMBERS, []);
      assert.equal((await norteStaff.post('/members', { firstName: 'X', lastName: 'Y' })).status, 403);
      await db.userCampus.create({ data: { userId: norteStaffId, campusId: norte } });
    });

    it('con varias sedes ve ambas y puede filtrar', async () => {
      await admin.patch(`/users/${norteStaffId}`, { campusIds: [norte, sur] });
      same(ids((await norteStaff.get(`/members?q=P${tag}`)).body.items), [memberNorte, memberSur]);
      same(ids((await norteStaff.get(`/members?q=P${tag}&campusId=${sur}`)).body.items), [memberSur]);
      assert.equal((await norteStaff.post('/members', { firstName: 'X', lastName: 'Y' })).status, 403, 'con varias debe indicar cuál');
      await admin.patch(`/users/${norteStaffId}`, { campusIds: [norte] });
    });
  });

  describe('sin permiso de rol, la sede no da acceso', () => {
    it('un miembro sin roles sigue sin ver miembros ni finanzas', async () => {
      assert.equal((await plainMember.get('/members')).status, 403);
      assert.equal((await plainMember.get('/finance/accounts')).status, 403);
      assert.equal((await plainMember.get('/campuses')).status, 200);
    });
  });

  describe('ciclo de vida', () => {
    it('no se apaga con usuarios limitados', async () => {
      const res = await admin.put('/campuses/settings', { enabled: false });
      assert.equal(res.status, 409);
      assert.equal((await admin.get('/campuses')).body.enabled, true);
      assert.equal((await admin.get('/campuses/manage')).body.restrictedUsers, 1);
    });

    it('una sede con datos no se borra; se archiva y deja de ofrecerse', async () => {
      assert.equal((await admin.del(`/campuses/${norte}`)).status, 409);
      assert.equal((await admin.del(`/campuses/${sur}`)).status, 409);
      assert.equal((await admin.patch(`/campuses/${sur}`, { name: 'Sur', active: false })).status, 200);
      assert.equal((await admin.post('/members', { firstName: 'X', lastName: 'Y', campusId: sur })).status, 400);
      assert.equal((await admin.post('/finance/accounts', { name: 'Otra', campusId: sur })).status, 400);
      assert.equal((await admin.post(`/campuses/${sur}/assign-unassigned`)).status, 409);
      assert.equal((await admin.patch(`/members/${memberSur}`, { firstName: 'Beto', lastName: `P${tag}`, campusId: sur })).status, 200, 'quien ya está en ella se puede seguir editando');
      assert.equal((await client('x').get(`/public/churches/a-${tag}`)).body.campuses.length, 1);
      assert.equal((await admin.patch(`/campuses/${sur}`, { name: 'Sur', active: true })).status, 200);
    });

    it('una sede sin datos se borra', async () => {
      const temp = (await admin.post('/campuses', { name: 'Temporal' })).body.id;
      assert.equal((await admin.del(`/campuses/${temp}`)).status, 200);
      assert.equal((await admin.del(`/campuses/${temp}`)).status, 404);
    });

    it('asigna de una vez a quienes no tienen sede', async () => {
      const before = await db.member.count({ where: { churchId: churchA, campusId: null } });
      assert.ok(before >= 1);
      const res = await admin.post(`/campuses/${sur}/assign-unassigned`);
      assert.equal(res.body.count, before);
      assert.equal((await admin.get('/campuses/manage')).body.unassignedMembers, 0);
      assert.equal(await db.member.count({ where: { churchId: churchB, campusId: sur } }), 0);
      await db.member.update({ where: { id: memberNone }, data: { campusId: null } });
    });

    it('quitar el límite devuelve el acceso; recién ahí se puede apagar', async () => {
      const res = await admin.patch(`/users/${norteStaffId}`, { campusRestricted: false });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.deepEqual(res.body.campuses, []);
      assert.equal((await norteStaff.get('/auth/me')).body.campusScopes.MEMBERS, null);
      assert.equal((await norteStaff.get(`/members?q=P${tag}`)).body.total, 3);
      assert.equal((await admin.put('/campuses/settings', { enabled: false })).status, 200);
      assert.equal((await admin.get('/campuses')).body.enabled, false);
      assert.equal((await db.member.findUnique({ where: { id: memberNorte } }))?.campusId, norte, 'no se pierde nada');
      assert.equal((await admin.get(`/members?q=P${tag}`)).body.total, 3);
      assert.equal((await admin.put('/campuses/settings', { enabled: true })).status, 200);
    });

    it('crear un usuario ya limitado', async () => {
      const res = await admin.post('/users', { firstName: 'Nuevo', lastName: 'Lim', email: `lim-${tag}@sedes.test`, password: '12345678', roleIds: [staffRole], campusRestricted: true, campusIds: [sur] });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.equal(res.body.campusRestricted, true);
      const bad = await admin.post('/users', { firstName: 'Nuevo', lastName: 'Lim', email: `lim2-${tag}@sedes.test`, password: '12345678', roleIds: [adminRole], campusRestricted: true, campusIds: [sur] });
      assert.equal(bad.status, 400);
      await db.user.delete({ where: { id: res.body.id } });
    });
  });

  describe('registro', () => {
    const profile = (email: string, churchSlug: string, campusId?: string) => ({
      churchSlug, email, password: '12345678', firstName: 'Reg', lastName: 'Istro', phone: '1234567', documentId: '12345', birthDate: '1990-01-01', address: 'Calle 1', consent: true, campusId,
    });

    it('quien se registra elige su sede', async () => {
      const email = `reg-${tag}@sedes.test`;
      const res = await client('x').post('/auth/register', profile(email, `a-${tag}`, norte));
      assert.ok(res.status < 300, JSON.stringify(res.body));
      assert.equal((await db.member.findFirst({ where: { email } }))?.campusId, norte);
    });

    it('sin sede también puede registrarse', async () => {
      const email = `reg2-${tag}@sedes.test`;
      const res = await client('x').post('/auth/register', profile(email, `a-${tag}`));
      assert.ok(res.status < 300);
      assert.equal((await db.member.findFirst({ where: { email } }))?.campusId, null);
    });

    it('no se puede elegir la sede de otra iglesia', async () => {
      const res = await client('x').post('/auth/register', profile(`reg3-${tag}@sedes.test`, `a-${tag}`, campusB));
      assert.equal(res.status, 400);
      assert.equal(await db.user.count({ where: { email: `reg3-${tag}@sedes.test` } }), 0);
    });

    it('si ya tenía ficha, una sede cargada por la iglesia manda', async () => {
      const email = `ficha-${tag}@sedes.test`;
      await admin.post('/members', { firstName: 'Fi', lastName: 'Cha', email, campusId: sur });
      const res = await client('x').post('/auth/register', profile(email, `a-${tag}`, norte));
      assert.ok(res.status < 300);
      assert.equal((await db.member.findFirst({ where: { email } }))?.campusId, sur);
    });
  });

  describe('borrados', () => {
    it('eliminar un usuario limitado no deja restos', async () => {
      const u = await makeUser(churchA, 'tmp', [staffRole]);
      await admin.patch(`/users/${u.user.id}`, { campusRestricted: true, campusIds: [norte] });
      await db.user.delete({ where: { id: u.user.id } });
      assert.equal(await db.userCampus.count({ where: { userId: u.user.id } }), 0);
    });

    it('borrar una iglesia con sedes funciona, con la misma secuencia que la baja real', async () => {
      await otherChurchAdmin.post('/finance/accounts', { name: 'Caja B', campusId: campusB });
      await otherChurchAdmin.post('/members', { firstName: 'En', lastName: 'B', campusId: campusB });
      await db.$transaction(async (tx) => {
        await tx.transaction.deleteMany({ where: { churchId: churchB } });
        await tx.church.delete({ where: { id: churchB } });
      });
      assert.equal(await db.campus.count({ where: { churchId: churchB } }), 0);
      assert.equal(await db.member.count({ where: { churchId: churchB } }), 0);
      assert.equal(await db.user.count({ where: { id: adminBId } }), 0);
    });
  });
});
