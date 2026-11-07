/**
 * Prueba de punta a punta de lo que cada iglesia elige separar por sede.
 *
 *   API_URL=http://localhost:4000/api DATABASE_URL=... JWT_SECRET=... npm run test:campuses
 *
 * Crea y borra sus propias iglesias, pero usa solo una base de pruebas: nunca la de producción.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { CampusAspect, Permission, PrismaClient, UserStatus } from '@prisma/client';
import ExcelJS from 'exceljs';
import { PushService } from '../src/push/push.service';

const API = process.env.API_URL ?? 'http://localhost:4000/api';
const db = new PrismaClient();
const jwt = new JwtService({ secret: process.env.JWT_SECRET });
const tag = randomBytes(4).toString('hex');
const ALL_CONTENT = ['ANNOUNCEMENTS', 'EVENTS', 'ARTICLES', 'STREAMS', 'APPOINTMENTS'];

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

const titles = (list: { title: string }[]) => list.map((x) => x.title).filter((t) => t.includes(tag)).sort();
const named = (name: string) => `${name} ${tag}`;
const tomorrow = () => new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();

describe('áreas separadas por sede', () => {
  let churchA: string, churchB: string, norte: string, sur: string, campusB: string;
  let admin: Client, adminB: Client, superAdmin: Client;
  let memberNorte: Client, memberSur: Client, memberNone: Client;
  let editorAll: Client, editorNorte: Client, treasurerNorte: Client, schedulerNorte: Client;
  let hostNorte: string, hostSur: string, hostNone: string;
  let memberNorteUser: string, memberSurUser: string, memberNoneUser: string, editorNorteUser: string, adminUser: string;
  let memberNorteId: string, memberSurId: string;

  const setSeparated = async (separated: string[]) => {
    const res = await admin.put('/campuses/settings', { separated });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  };

  async function makeUser(churchId: string | null, name: string, roleIds: string[], campusId?: string | null, limit?: string[], superUser = false) {
    const user = await db.user.create({
      data: {
        churchId,
        isSuperAdmin: superUser,
        email: `${name}-${tag}@aspectos.test`,
        firstName: name,
        lastName: 'Prueba',
        status: UserStatus.ACTIVE,
        campusRestricted: !!limit,
        ...(limit && { campuses: { create: limit.map((id) => ({ campusId: id })) } }),
        roles: { create: roleIds.map((roleId) => ({ roleId })) },
        ...(churchId && campusId !== undefined && { member: { create: { churchId, firstName: name, lastName: `P${tag}`, campusId } } }),
      },
      include: { member: true },
    });
    return { user, api: (headers?: Record<string, string>) => client(jwt.sign({ sub: user.id }, { expiresIn: '1h' }), headers) };
  }

  before(async () => {
    const [a, b] = await Promise.all([
      db.church.create({ data: { name: `A ${tag}`, slug: `asp-a-${tag}`, billingExempt: true, campusesEnabled: true } }),
      db.church.create({ data: { name: `B ${tag}`, slug: `asp-b-${tag}`, billingExempt: true, campusesEnabled: true } }),
    ]);
    churchA = a.id;
    churchB = b.id;
    norte = (await db.campus.create({ data: { churchId: churchA, name: 'Norte' } })).id;
    sur = (await db.campus.create({ data: { churchId: churchA, name: 'Sur' } })).id;
    campusB = (await db.campus.create({ data: { churchId: churchB, name: 'Norte' } })).id;

    const role = (churchId: string, name: string, permissions: Permission[], isAdmin = false) => db.churchRole.create({ data: { churchId, name, permissions, isAdmin } }).then((r) => r.id);
    const adminRole = await role(churchA, 'Admin', [], true);
    const editorRole = await role(churchA, 'Editor', [Permission.CONTENT_MANAGE, Permission.ARTICLES_MANAGE, Permission.ACTIVITY_VIEW]);
    const treasurerRole = await role(churchA, 'Tesorería', [Permission.FINANCE_VIEW, Permission.FINANCE_EDIT, Permission.MEMBERS_VIEW, Permission.MEMBERS_EDIT]);
    const schedulerRole = await role(churchA, 'Agenda', [Permission.APPOINTMENTS_ALL]);
    const hostRole = await role(churchA, 'Líder', [Permission.APPOINTMENTS_HOST]);

    const adminU = await makeUser(churchA, 'admin', [adminRole]);
    admin = adminU.api();
    adminUser = adminU.user.id;
    adminB = (await makeUser(churchB, 'adminb', [await role(churchB, 'Admin', [], true)])).api();
    superAdmin = (await makeUser(null, 'super', [], undefined, undefined, true)).api({ 'x-church-id': churchA });

    const mn = await makeUser(churchA, 'mnorte', [], norte);
    memberNorte = mn.api();
    memberNorteUser = mn.user.id;
    memberNorteId = mn.user.member!.id;
    const ms = await makeUser(churchA, 'msur', [], sur);
    memberSur = ms.api();
    memberSurUser = ms.user.id;
    memberSurId = ms.user.member!.id;
    const m0 = await makeUser(churchA, 'msinsede', [], null);
    memberNone = m0.api();
    memberNoneUser = m0.user.id;

    editorAll = (await makeUser(churchA, 'editor', [editorRole])).api();
    const en = await makeUser(churchA, 'enorte', [editorRole], null, [norte]);
    editorNorte = en.api();
    editorNorteUser = en.user.id;
    treasurerNorte = (await makeUser(churchA, 'tnorte', [treasurerRole], null, [norte])).api();
    schedulerNorte = (await makeUser(churchA, 'anorte', [schedulerRole], null, [norte])).api();

    const host = async (name: string, campusId: string | null) => {
      const { user } = await makeUser(churchA, name, [hostRole], campusId);
      await db.availability.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ churchId: churchA, userId: user.id, weekday, startTime: '00:00', endTime: '23:30', slotMinutes: 30 })) });
      return user.id;
    };
    hostNorte = await host('hnorte', norte);
    hostSur = await host('hsur', sur);
    hostNone = await host('hgeneral', null);
  });

  after(async () => {
    await db.transaction.deleteMany({ where: { churchId: { in: [churchA, churchB] } } });
    await db.church.deleteMany({ where: { id: { in: [churchA, churchB] } } });
    await db.user.deleteMany({ where: { email: { endsWith: `-${tag}@aspectos.test` } } });
    await db.$disconnect();
  });

  describe('la configuración', () => {
    it('por defecto separa miembros y finanzas', async () => {
      const { separated } = (await admin.get('/campuses/manage')).body;
      assert.deepEqual(separated, ['MEMBERS', 'FINANCE']);
    });

    it('rechaza áreas inexistentes y a quien no tiene el permiso', async () => {
      assert.equal((await admin.put('/campuses/settings', { separated: ['NADA'] })).status, 400);
      assert.equal((await memberNorte.put('/campuses/settings', { separated: [] })).status, 403);
      assert.equal((await treasurerNorte.put('/campuses/settings', { separated: [] })).status, 403);
      assert.deepEqual((await admin.get('/campuses/manage')).body.separated, ['MEMBERS', 'FINANCE']);
    });

    it('cambiar las áreas no apaga las sedes, ni apagarlas pierde las áreas', async () => {
      await setSeparated(['FINANCE', 'EVENTS']);
      assert.equal((await admin.get('/campuses')).body.enabled, true);
      await setSeparated(['MEMBERS', 'FINANCE']);
    });
  });

  describe('con el contenido compartido', () => {
    it('una sede pedida se ignora y lo ven todos', async () => {
      const created = await editorNorte.post('/announcements', { title: named('Compartida'), body: 'x', campusId: sur });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      assert.equal(created.body.campusId, null);
      for (const who of [memberNorte, memberSur, memberNone]) assert.ok(titles((await who.get('/announcements')).body.items).includes(named('Compartida')));
      await admin.del(`/announcements/${created.body.id}`);
    });
  });

  describe('novedades separadas', () => {
    let general: string, enNorte: string, enSur: string;

    before(async () => {
      await setSeparated(['MEMBERS', 'FINANCE', ...ALL_CONTENT]);
      general = (await editorAll.post('/announcements', { title: named('General'), body: 'x' })).body.id;
      enNorte = (await editorAll.post('/announcements', { title: named('De Norte'), body: 'x', campusId: norte })).body.id;
      enSur = (await editorAll.post('/announcements', { title: named('De Sur'), body: 'x', campusId: sur })).body.id;
      await editorAll.post('/announcements', { title: named('Borrador Norte'), body: 'x', campusId: norte, published: false });
    });

    it('cada persona ve lo general y lo de su sede, sin borradores', async () => {
      assert.deepEqual(titles((await memberNorte.get('/announcements')).body.items), [named('De Norte'), named('General')]);
      assert.deepEqual(titles((await memberSur.get('/announcements')).body.items), [named('De Sur'), named('General')]);
      assert.deepEqual(titles((await memberNone.get('/announcements')).body.items), [named('General')]);
    });

    it('el total de la paginación tampoco cuenta lo ajeno', async () => {
      assert.equal((await memberNone.get('/announcements')).body.total, 1);
    });

    it('el inicio respeta lo mismo', async () => {
      assert.deepEqual(titles((await memberSur.get('/dashboard')).body.announcements), [named('De Sur'), named('General')]);
      assert.deepEqual(titles((await memberNone.get('/dashboard')).body.announcements), [named('General')]);
    });

    it('un miembro no puede pedir otra sede con el filtro', async () => {
      assert.equal((await memberNorte.get(`/announcements?campusId=${sur}`)).status, 403);
      assert.equal((await memberNone.get(`/announcements?campusId=${norte}`)).status, 403);
    });

    it('la administración y un editor sin límite ven todo y pueden filtrar', async () => {
      for (const who of [admin, editorAll, superAdmin]) {
        assert.equal(titles((await who.get('/announcements')).body.items).length, 4);
        assert.deepEqual(titles((await who.get(`/announcements?campusId=${sur}`)).body.items), [named('De Sur')]);
        assert.deepEqual(titles((await who.get('/announcements?campusId=none')).body.items), [named('General')]);
      }
    });

    it('un editor limitado ve lo suyo y publica solo ahí', async () => {
      assert.deepEqual(titles((await editorNorte.get('/announcements')).body.items), [named('Borrador Norte'), named('De Norte'), named('General')]);
      const own = await editorNorte.post('/announcements', { title: named('Propia'), body: 'x' });
      assert.equal(own.status, 201);
      assert.equal(own.body.campusId, norte, 'con una sola sede, va a esa');
      assert.equal((await editorNorte.post('/announcements', { title: named('Hack'), body: 'x', campusId: sur })).status, 403);
      await admin.del(`/announcements/${own.body.id}`);
    });

    it('un editor limitado no toca lo general ni lo de otra sede', async () => {
      const body = { title: named('Hack'), body: 'x' };
      assert.equal((await editorNorte.patch(`/announcements/${general}`, body)).status, 403);
      assert.equal((await editorNorte.patch(`/announcements/${enSur}`, body)).status, 403);
      assert.equal((await editorNorte.del(`/announcements/${general}`)).status, 403);
      assert.equal((await editorNorte.del(`/announcements/${enSur}`)).status, 403);
      assert.equal((await editorNorte.patch(`/announcements/${enNorte}`, { ...body, title: named('De Norte'), campusId: sur })).status, 403, 'no la manda a otra sede');
      assert.equal((await editorNorte.patch(`/announcements/${enNorte}`, { ...body, title: named('De Norte'), campusId: null })).status, 403, 'no la vuelve general');
      assert.equal((await db.announcement.findUniqueOrThrow({ where: { id: enNorte } })).campusId, norte);
    });

    it('no acepta la sede de otra iglesia, y la base tampoco', async () => {
      assert.equal((await admin.post('/announcements', { title: named('Cruce'), body: 'x', campusId: campusB })).status, 400);
      await assert.rejects(db.announcement.create({ data: { churchId: churchA, title: 'x', body: 'x', campusId: campusB } }));
      assert.equal((await adminB.get('/announcements')).body.total, 0);
    });

    it('los avisos llegan solo a quienes corresponde', async () => {
      const sends: { where: any }[] = [];
      for (const id of [memberNorteUser, memberSurUser, memberNoneUser, editorNorteUser, adminUser]) {
        await db.pushSubscription.create({ data: { userId: id, endpoint: `https://push.test/${id}`, p256dh: 'x', auth: 'x' } });
      }
      const service = Object.create(PushService.prototype) as PushService;
      (service as any).enqueue = async (where: unknown) => void sends.push({ where });
      const owners = async (campusId?: string | null) => {
        await service.sendToChurch(churchA, { title: 't', body: 'b', url: '/' }, adminUser, campusId);
        const subs = await db.pushSubscription.findMany({ where: sends[sends.length - 1].where, select: { userId: true } });
        return subs.map((s) => s.userId).sort();
      };
      assert.deepEqual(await owners(norte), [memberNorteUser, editorNorteUser].sort());
      assert.deepEqual(await owners(sur), [memberSurUser]);
      assert.deepEqual(await owners(null), [memberNorteUser, memberSurUser, memberNoneUser, editorNorteUser].sort());
    });

    it('una sede con publicaciones no se elimina', async () => {
      assert.equal((await admin.del(`/campuses/${sur}`)).status, 409);
    });
  });

  describe('eventos separados', () => {
    let eventNorte: string;

    before(async () => {
      await editorAll.post('/events', { title: named('Evento general'), startsAt: tomorrow() });
      eventNorte = (await editorAll.post('/events', { title: named('Evento Norte'), startsAt: tomorrow(), campusId: norte })).body.id;
      await editorAll.post('/events', { title: named('Evento Sur privado'), startsAt: tomorrow(), campusId: sur, isPublic: false });
    });

    it('la agenda y el inicio filtran por sede', async () => {
      assert.deepEqual(titles((await memberSur.get('/events')).body), [named('Evento Sur privado'), named('Evento general')]);
      assert.deepEqual(titles((await memberNone.get('/events')).body), [named('Evento general')]);
      assert.deepEqual(titles((await memberNorte.get('/dashboard')).body.events), [named('Evento Norte'), named('Evento general')]);
    });

    it('el calendario suscripto también', async () => {
      const { token } = (await memberNorte.get('/calendar/subscription')).body;
      const ics = await (await fetch(`${API}/calendar/feed/${token}.ics`)).text();
      assert.ok(ics.includes('Evento Norte'));
      assert.ok(ics.includes('Evento general'));
      assert.ok(!ics.includes('Evento Sur'));
    });

    it('la página pública indica la sede y no muestra lo privado', async () => {
      const { events } = (await client('x').get(`/public/churches/asp-a-${tag}`)).body;
      assert.equal(events.find((e: any) => e.title === named('Evento Norte')).campus.name, 'Norte');
      assert.equal(events.find((e: any) => e.title === named('Evento general')).campus, null);
      assert.ok(!events.some((e: any) => e.title === named('Evento Sur privado')));
    });

    it('un editor limitado no edita ni borra lo ajeno', async () => {
      const general = (await db.event.findFirstOrThrow({ where: { title: named('Evento general') } })).id;
      assert.equal((await editorNorte.patch(`/events/${general}`, { title: named('Hack'), startsAt: tomorrow() })).status, 403);
      assert.equal((await editorNorte.del(`/events/${general}`)).status, 403);
      assert.equal((await editorNorte.patch(`/events/${eventNorte}`, { title: named('Evento Norte'), startsAt: tomorrow() })).status, 200);
    });
  });

  describe('artículos separados', () => {
    let articleSur: string;

    before(async () => {
      await editorAll.post('/articles', { title: named('Artículo general'), body: '<p>hola</p>' });
      articleSur = (await editorAll.post('/articles', { title: named('Artículo Sur'), body: '<p>hola</p>', campusId: sur })).body.id;
    });

    it('el listado filtra, también al buscar', async () => {
      assert.deepEqual(titles((await memberNorte.get('/articles')).body.items), [named('Artículo general')]);
      assert.deepEqual(titles((await memberNorte.get(`/articles?q=${tag}`)).body.items), [named('Artículo general')], 'la búsqueda no debe saltarse la sede');
      assert.deepEqual(titles((await memberSur.get(`/articles?q=${tag}`)).body.items), [named('Artículo Sur'), named('Artículo general')]);
    });

    it('conocer la dirección o pedir el PDF no alcanza', async () => {
      assert.equal((await memberNorte.get(`/articles/${articleSur}`)).status, 404);
      assert.equal((await memberNorte.get(`/articles/${articleSur}/pdf`)).status, 404);
      assert.equal((await memberSur.get(`/articles/${articleSur}`)).status, 200);
    });

    it('un editor limitado no lo cambia', async () => {
      assert.equal((await editorNorte.patch(`/articles/${articleSur}`, { title: named('Hack'), body: '<p>x</p>' })).status, 403);
      assert.equal((await editorNorte.del(`/articles/${articleSur}`)).status, 403);
    });
  });

  describe('en vivo separado', () => {
    let liveNorte: string, liveSur: string, liveGeneral: string;
    const stream = (name: string, campusId?: string | null, isLive = true) => ({ title: named(name), url: 'https://youtu.be/abc', isLive, campusId });

    it('dos sedes transmiten a la vez y cada una ve la suya', async () => {
      liveNorte = (await editorAll.post('/streams', stream('Culto Norte', norte))).body.id;
      liveSur = (await editorAll.post('/streams', stream('Culto Sur', sur))).body.id;
      assert.equal((await memberNorte.get('/streams')).body.live.id, liveNorte);
      assert.equal((await memberSur.get('/streams')).body.live.id, liveSur);
      assert.equal((await memberNone.get('/streams')).body.live, null);
      assert.equal((await memberSur.get('/dashboard')).body.live.id, liveSur);
    });

    it('lo que empieza en una sede solo reemplaza a su misma sede', async () => {
      const again = await editorAll.post('/streams', stream('Otro Norte', norte));
      assert.equal((await db.liveStream.findUniqueOrThrow({ where: { id: liveNorte } })).isLive, false);
      assert.equal((await db.liveStream.findUniqueOrThrow({ where: { id: liveSur } })).isLive, true);
      await editorAll.post(`/streams/${liveNorte}/live`, { isLive: true });
      assert.equal((await db.liveStream.findUniqueOrThrow({ where: { id: again.body.id } })).isLive, false);
      assert.equal((await db.liveStream.findUniqueOrThrow({ where: { id: liveSur } })).isLive, true);
    });

    it('un editor limitado no maneja la transmisión de otra sede', async () => {
      assert.equal((await editorNorte.post(`/streams/${liveSur}/live`, { isLive: false })).status, 403);
      assert.equal((await editorNorte.del(`/streams/${liveSur}`)).status, 403);
      assert.equal((await editorNorte.post(`/streams/${liveNorte}/live`, { isLive: false })).status, 201);
      await editorNorte.post(`/streams/${liveNorte}/live`, { isLive: true });
    });

    it('al compartir vuelve a haber una sola en vivo', async () => {
      await setSeparated(['MEMBERS', 'FINANCE', 'ANNOUNCEMENTS', 'EVENTS', 'ARTICLES', 'APPOINTMENTS']);
      liveGeneral = (await editorAll.post('/streams', stream('Culto unido'))).body.id;
      const live = await db.liveStream.findMany({ where: { churchId: churchA, isLive: true } });
      assert.deepEqual(live.map((s) => s.id), [liveGeneral]);
      for (const who of [memberNorte, memberSur, memberNone]) assert.equal((await who.get('/streams')).body.live.id, liveGeneral);
      await setSeparated(['MEMBERS', 'FINANCE', ...ALL_CONTENT]);
    });
  });

  describe('citas separadas', () => {
    let apptNorte: string, apptSur: string;

    const book = async (who: Client, hostId: string) => {
      const { days } = (await who.get(`/appointments/slots?hostId=${hostId}&days=4`)).body;
      const slot = days.flatMap((d: any) => d.slots).find((s: any) => new Date(s.startsAt).getTime() > Date.now() + 26 * 3600 * 1000);
      return who.post('/appointments', { hostId, startsAt: slot.startsAt });
    };

    it('cada persona ve a los líderes de su sede y a los que no tienen sede', async () => {
      const list = async (who: Client) => (await who.get('/users/hosts')).body.map((h: any) => h.id).sort();
      // La administración siempre figura y, sin ficha, no pertenece a ninguna sede.
      assert.deepEqual(await list(memberNorte), [hostNorte, hostNone, adminUser].sort());
      assert.deepEqual(await list(memberNone), [hostNone, adminUser].sort());
      assert.deepEqual(await list(admin), [hostNorte, hostSur, hostNone, adminUser].sort());
    });

    it('no se ven horarios ni se reserva con un líder de otra sede', async () => {
      assert.equal((await memberNorte.get(`/appointments/slots?hostId=${hostSur}`)).status, 404);
      const startsAt = tomorrow();
      assert.equal((await memberNorte.post('/appointments', { hostId: hostSur, startsAt })).status, 404);
    });

    it('con su propia sede reserva normalmente', async () => {
      const res = await book(memberNorte, hostNorte);
      assert.equal(res.status, 201, JSON.stringify(res.body));
      apptNorte = res.body.id;
      apptSur = (await book(memberSur, hostSur)).body.id;
      assert.ok(apptSur);
    });

    it('quien ve todas estando limitado solo alcanza a su sede', async () => {
      const list = (await schedulerNorte.get('/appointments?scope=all')).body;
      assert.deepEqual(list.map((a: any) => a.id), [apptNorte]);
      assert.equal((await schedulerNorte.get(`/appointments?scope=all&campusId=${sur}`)).status, 403);
      assert.equal((await schedulerNorte.patch(`/appointments/${apptSur}/status`, { status: 'CONFIRMED' })).status, 403);
      assert.equal((await schedulerNorte.patch(`/appointments/${apptNorte}/status`, { status: 'CONFIRMED' })).status, 200);
    });

    it('la administración ve todas y puede filtrar', async () => {
      const ids = (await admin.get('/appointments?scope=all')).body.map((a: any) => a.id);
      assert.ok(ids.includes(apptNorte) && ids.includes(apptSur));
      assert.deepEqual((await admin.get(`/appointments?scope=all&campusId=${sur}`)).body.map((a: any) => a.id), [apptSur]);
    });

    it('una cita ya pedida sigue visible para quien la pidió', async () => {
      await db.member.update({ where: { id: memberNorteId }, data: { campusId: sur } });
      assert.ok((await memberNorte.get('/appointments?scope=mine')).body.some((a: any) => a.id === apptNorte));
      await db.member.update({ where: { id: memberNorteId }, data: { campusId: norte } });
    });
  });

  describe('todo junto menos las finanzas', () => {
    let accNorte: string, accSur: string, category: string;

    before(async () => {
      await setSeparated(['FINANCE']);
      accNorte = (await admin.post('/finance/accounts', { name: named('Caja Norte'), currency: 'ARS', campusId: norte })).body.id;
      accSur = (await admin.post('/finance/accounts', { name: named('Caja Sur'), currency: 'ARS', campusId: sur })).body.id;
      category = (await db.financeCategory.create({ data: { churchId: churchA, name: `Diezmo ${tag}`, type: 'INCOME', isTithe: true } })).id;
    });

    it('un responsable limitado ve a todos los miembros, pero solo el dinero de su sede', async () => {
      const members = (await treasurerNorte.get(`/members?q=P${tag}`)).body;
      assert.ok(members.items.some((m: any) => m.id === memberSurId));
      assert.deepEqual((await treasurerNorte.get('/finance/accounts')).body.map((a: any) => a.id).filter((id: string) => id === accNorte || id === accSur), [accNorte]);
      assert.equal((await treasurerNorte.get(`/finance/accounts?campusId=${sur}`)).status, 403);
    });

    it('registra el aporte de alguien de otra sede en su propia cuenta', async () => {
      const res = await treasurerNorte.post('/finance/transactions', { accountId: accNorte, categoryId: category, type: 'INCOME', amount: 10, date: tomorrow().slice(0, 10), memberId: memberSurId });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      const other = await admin.post('/finance/transactions', { accountId: accSur, categoryId: category, type: 'INCOME', amount: 99, date: tomorrow().slice(0, 10), memberId: memberSurId });
      assert.equal(other.status, 201);
    });

    it('en la ficha de otra sede solo ve los aportes de sus cuentas', async () => {
      const { giving } = (await treasurerNorte.get(`/members/${memberSurId}`)).body;
      assert.deepEqual(giving.map((g: any) => Number(g.amount)), [10]);
    });

    it('no se pide sede al registrarse ni aparece en el Excel de miembros', async () => {
      assert.deepEqual((await client('x').get(`/public/churches/asp-a-${tag}`)).body.campuses, []);
      const res = await admin.get('/members/export');
      assert.equal(res.status, 200);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await res.raw.arrayBuffer());
      assert.ok(!JSON.stringify(wb.getWorksheet('Miembros')!.getRow(1).values).includes('Sede'));
    });

    it('novedades, eventos y citas vuelven a ser de todos, sin perder a qué sede pertenecían', async () => {
      assert.ok(titles((await memberNone.get('/announcements')).body.items).includes(named('De Sur')));
      assert.ok(titles((await memberNone.get('/events')).body).includes(named('Evento Sur privado')));
      assert.equal((await memberNorte.get(`/appointments/slots?hostId=${hostSur}`)).status, 200);
      assert.equal((await db.announcement.findFirstOrThrow({ where: { title: named('De Sur') } })).campusId, sur);
    });

    it('editar algo mientras es compartido no le cambia la sede', async () => {
      const a = await db.announcement.findFirstOrThrow({ where: { title: named('De Sur') } });
      assert.equal((await editorNorte.patch(`/announcements/${a.id}`, { title: named('De Sur'), body: 'editada', campusId: null })).status, 200);
      assert.equal((await db.announcement.findUniqueOrThrow({ where: { id: a.id } })).campusId, sur);
    });

    it('al volver a separar, cada cosa sigue en su sede', async () => {
      await setSeparated(['FINANCE', 'ANNOUNCEMENTS']);
      assert.ok(!titles((await memberNorte.get('/announcements')).body.items).includes(named('De Sur')));
      assert.ok(titles((await memberSur.get('/announcements')).body.items).includes(named('De Sur')));
    });
  });

  describe('todo junto menos los miembros', () => {
    before(() => setSeparated(['MEMBERS']));

    it('un responsable limitado ve todo el dinero, pero solo los miembros de su sede', async () => {
      const members = (await treasurerNorte.get(`/members?q=P${tag}`)).body.items;
      assert.ok(members.every((m: any) => m.campusId === norte));
      assert.equal((await treasurerNorte.get(`/members/${memberSurId}`)).status, 404);
      const accounts = (await treasurerNorte.get('/finance/accounts')).body.map((a: any) => a.name);
      assert.ok(accounts.includes(named('Caja Norte')) && accounts.includes(named('Caja Sur')));
    });

    it('al ser compartidas, también administra las categorías', async () => {
      const res = await treasurerNorte.post('/finance/categories', { name: named('Nueva'), type: 'EXPENSE' });
      assert.equal(res.status, 201, JSON.stringify(res.body));
    });

    it('no asocia un aporte a un miembro de otra sede', async () => {
      const account = await db.financeAccount.findFirstOrThrow({ where: { churchId: churchA, name: named('Caja Sur') } });
      const category = await db.financeCategory.findFirstOrThrow({ where: { churchId: churchA, name: `Diezmo ${tag}` } });
      const res = await treasurerNorte.post('/finance/transactions', { accountId: account.id, categoryId: category.id, type: 'INCOME', amount: 1, date: tomorrow().slice(0, 10), memberId: memberSurId });
      assert.equal(res.status, 400);
    });

    it('sigue pidiendo sede al registrarse', async () => {
      assert.equal((await client('x').get(`/public/churches/asp-a-${tag}`)).body.campuses.length, 2);
    });
  });

  describe('límites que no dependen de las áreas', () => {
    it('quien está limitado nunca entra al registro de actividad ni a la configuración', async () => {
      await setSeparated([]);
      assert.equal((await editorNorte.get('/activity')).status, 403);
      assert.equal((await editorNorte.get('/users')).status, 403);
      assert.equal((await editorNorte.put('/campuses/settings', { separated: [] })).status, 403);
      assert.equal((await editorAll.get('/activity')).status, 200);
    });

    it('sin nada separado, un límite no recorta nada', async () => {
      const scopes = (await treasurerNorte.get('/auth/me')).body.campusScopes;
      for (const aspect of Object.values(CampusAspect)) assert.equal(scopes[aspect], null, aspect);
    });

    it('el super admin opera con la configuración de la iglesia elegida', async () => {
      await setSeparated(['ANNOUNCEMENTS']);
      const res = await superAdmin.post('/announcements', { title: named('Del super'), body: 'x', campusId: sur });
      assert.equal(res.status, 201);
      assert.equal(res.body.campusId, sur);
      assert.ok(!titles((await memberNorte.get('/announcements')).body.items).includes(named('Del super')));
    });

    it('marcar en vivo a la vez deja una sola transmisión por sede y ningún error', async () => {
      await setSeparated(['STREAMS']);
      const ids: string[] = [];
      for (let i = 0; i < 8; i++) ids.push((await admin.post('/streams', { title: named(`Carrera ${i}`), url: 'https://youtu.be/x', campusId: sur })).body.id);
      for (let round = 0; round < 3; round++) {
        const results = await Promise.all(ids.map((id) => admin.post(`/streams/${id}/live`, { isLive: true })));
        assert.deepEqual([...new Set(results.map((r) => r.status))], [201]);
        assert.equal(await db.liveStream.count({ where: { churchId: churchA, campusId: sur, isLive: true } }), 1);
      }
    });

    it('publicar en una sede mientras se borra nunca da un error de servidor', async () => {
      await setSeparated(['ANNOUNCEMENTS']);
      for (let i = 0; i < 6; i++) {
        const campus = await admin.post('/campuses', { name: named(`Efímera ${i}`) });
        assert.equal(campus.status, 201);
        const [removed, ...published] = await Promise.all([
          admin.del(`/campuses/${campus.body.id}`),
          ...Array.from({ length: 4 }, () => admin.post('/announcements', { title: named('Carrera'), body: 'x', campusId: campus.body.id })),
        ]);
        assert.ok([200, 409].includes(removed.status), `borrar: ${removed.status}`);
        for (const r of published) assert.ok([201, 400].includes(r.status), `publicar: ${r.status}`);
      }
    });

    it('si se apagan las sedes, todos vuelven a ver todo y lo guardado no se pierde', async () => {
      await db.user.updateMany({ where: { churchId: churchA }, data: { campusRestricted: false } });
      assert.equal((await admin.put('/campuses/settings', { enabled: false })).status, 200);
      assert.ok(titles((await memberNorte.get('/announcements')).body.items).includes(named('Del super')));
      assert.deepEqual((await admin.get('/campuses')).body, { enabled: false, separated: [], items: [] });
      assert.deepEqual((await admin.get('/campuses/manage')).body.separated, ['ANNOUNCEMENTS']);
    });

    it('borrar una iglesia con publicaciones por sede funciona', async () => {
      await db.$transaction(async (tx) => {
        await tx.transaction.deleteMany({ where: { churchId: churchA } });
        await tx.church.delete({ where: { id: churchA } });
      });
      assert.equal(await db.campus.count({ where: { churchId: churchA } }), 0);
      assert.equal(await db.announcement.count({ where: { churchId: churchA } }), 0);
    });
  });
});
