/**
 * Se ejecuta en cada arranque del contenedor (es idempotente):
 *  1. Crea el SUPER_ADMIN definido por SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD si no existe.
 *  2. Si SEED_DEMO=true y no hay iglesias, carga 3 iglesias de demostración.
 */
import { Currency, Prisma, PrismaClient, TransactionType, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { DefaultRoleKey, DefaultStatusKey, setupChurchDefaults } from '../src/churches/church-defaults';

const prisma = new PrismaClient();
const DEMO_PASSWORD = 'kahal1234';
// Link de YouTube/Facebook para las transmisiones de demo (idealmente el canal real de una iglesia).
const DEMO_STREAM_URL = process.env.DEMO_STREAM_URL || 'https://www.youtube.com/watch?v=jfKfPfyJRdk';

// PRNG determinístico para que la demo sea siempre igual.
let seed = 42;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
const between = (min: number, max: number) => Math.round(min + rand() * (max - min));
const roundTo = (n: number, step: number) => Math.round(n / step) * step;

const FIRST_M = ['Juan', 'Carlos', 'Martín', 'Lucas', 'Diego', 'Pablo', 'Javier', 'Matías', 'Nicolás', 'Andrés', 'Gabriel', 'Daniel', 'Samuel', 'David', 'Tomás', 'Joaquín', 'Esteban', 'Ricardo', 'Fernando', 'Hernán'];
const FIRST_F = ['María', 'Laura', 'Sofía', 'Valeria', 'Lucía', 'Ana', 'Carolina', 'Gabriela', 'Florencia', 'Paula', 'Natalia', 'Rocío', 'Daniela', 'Silvia', 'Marta', 'Julieta', 'Camila', 'Débora', 'Raquel', 'Noemí'];
const LAST = ['González', 'Rodríguez', 'Gómez', 'Fernández', 'López', 'Díaz', 'Martínez', 'Pérez', 'Romero', 'Sánchez', 'Álvarez', 'Torres', 'Ruiz', 'Ramírez', 'Flores', 'Benítez', 'Acosta', 'Medina', 'Herrera', 'Aguirre', 'Suárez', 'Molina', 'Castro', 'Ortiz', 'Silva', 'Rojas', 'Núñez', 'Luna', 'Juárez', 'Cabrera'];
const STREETS = ['Av. San Martín', 'Belgrano', 'Mitre', 'Sarmiento', 'Rivadavia', 'Av. Libertador', 'Moreno', 'Urquiza', '9 de Julio', 'Independencia'];
const MINISTRIES = [
  { name: 'Alabanza', description: 'Música y adoración en los cultos' },
  { name: 'Jóvenes', description: 'Reuniones de jóvenes de 18 a 30 años' },
  { name: 'Niños', description: 'Escuela dominical y actividades para niños' },
  { name: 'Matrimonios', description: 'Acompañamiento y talleres para matrimonios' },
  { name: 'Acción social', description: 'Comedor comunitario y ayuda a familias' },
  { name: 'Ujieres', description: 'Recepción y orden durante las reuniones' },
  { name: 'Multimedia', description: 'Sonido, proyección y transmisiones' },
  { name: 'Intercesión', description: 'Grupo de oración' },
];

const DEMO_CHURCHES = [
  {
    name: 'Iglesia Evangélica Monte Sion',
    slug: 'monte-sion',
    city: 'Buenos Aires',
    address: 'Av. Rivadavia 4520, CABA',
    phone: '+54 11 4555-1020',
    primaryColor: '#4f46e5',
    description: 'Una comunidad de fe en el corazón de Caballito. Cultos los domingos a las 10:00 y a las 19:00.',
    members: 90,
    scale: 1,
  },
  {
    name: 'Comunidad Cristiana Nueva Vida',
    slug: 'nueva-vida',
    city: 'Córdoba',
    address: 'Bv. San Juan 880, Córdoba',
    phone: '+54 351 422-3344',
    primaryColor: '#0d9488',
    description: 'Iglesia familiar en barrio Güemes. Reuniones los domingos a las 18:00 y células durante la semana.',
    members: 60,
    scale: 0.7,
  },
  {
    name: 'Iglesia Bautista Emanuel',
    slug: 'emanuel',
    city: 'Rosario',
    address: 'Pellegrini 1650, Rosario',
    phone: '+54 341 448-9900',
    primaryColor: '#b45309',
    description: 'Más de 40 años sirviendo a Rosario. Escuela bíblica dominical a las 9:30 y culto a las 11:00.',
    members: 45,
    scale: 0.5,
  },
];

const day = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

async function ensureSuperAdmin() {
  const email = process.env.SUPERADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.SUPERADMIN_PASSWORD;
  if (!email || !password) {
    console.log('[seed] SUPERADMIN_EMAIL/SUPERADMIN_PASSWORD no definidos: no se crea super admin');
    return;
  }
  if (await prisma.user.findUnique({ where: { email } })) return;
  await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(password, 10),
      firstName: 'Super',
      lastName: 'Admin',
      isSuperAdmin: true,
      status: UserStatus.ACTIVE,
    },
  });
  console.log(`[seed] Super admin creado: ${email}`);
}

async function seedChurch(def: (typeof DEMO_CHURCHES)[number], passwordHash: string) {
  const church = await prisma.church.create({
    data: {
      name: def.name,
      slug: def.slug,
      city: def.city,
      address: def.address,
      phone: def.phone,
      email: `contacto@${def.slug}.demo`,
      primaryColor: def.primaryColor,
      description: def.description,
    },
  });
  const { roles, statuses } = await setupChurchDefaults(prisma, church.id);
  const statusLinks = (keys: DefaultStatusKey[]) => ({ create: keys.map((k) => ({ statusId: statuses[k] })) });
  await prisma.financeAccount.create({ data: { churchId: church.id, name: 'Fondo en dólares', currency: Currency.USD, initialBalance: 1500 } });
  await prisma.financeAccount.updateMany({ where: { churchId: church.id, name: 'Caja general' }, data: { initialBalance: roundTo(350000 * def.scale, 1000) } });
  await prisma.financeAccount.updateMany({ where: { churchId: church.id, name: 'Banco' }, data: { initialBalance: roundTo(2500000 * def.scale, 1000) } });

  // Usuarios del staff y miembros con cuenta.
  // Sin rol = miembro con acceso básico.
  const staffDefs: { role?: DefaultRoleKey; first: string; last: string; key: string }[] = [
    { role: 'pastor', first: 'Ricardo', last: pick(LAST), key: 'pastor' },
    { role: 'equipo', first: 'Daniel', last: pick(LAST), key: 'equipo' },
    { role: 'lider', first: 'Raquel', last: pick(LAST), key: 'lider' },
    { role: 'tesoreria', first: 'Silvia', last: pick(LAST), key: 'tesoreria' },
    { role: 'secretaria', first: 'Paula', last: pick(LAST), key: 'secretaria' },
    { first: 'Lucas', last: pick(LAST), key: 'miembro' },
    { first: 'Camila', last: pick(LAST), key: 'miembro2' },
  ];
  const users: Record<string, { id: string; firstName: string; lastName: string }> = {};
  for (const s of staffDefs) {
    const email = `${s.key}@${def.slug}.demo`;
    const user = await prisma.user.create({
      data: {
        churchId: church.id,
        email,
        passwordHash,
        firstName: s.first,
        lastName: s.last,
        status: UserStatus.ACTIVE,
        ...(s.role && { roles: { create: { roleId: roles[s.role] } } }),
        consentAt: new Date(),
        member: {
          create: {
            churchId: church.id,
            firstName: s.first,
            lastName: s.last,
            email,
            phone: `+54 9 11 ${between(4000, 6999)}-${between(1000, 9999)}`,
            statuses: statusLinks(s.role ? ['miembro', 'bautizado'] : ['miembro']),
            joinedAt: addDays(new Date(), -between(400, 4000)),
          },
        },
      },
    });
    users[s.key] = user;
  }

  // Ministerios, familias y padrón.
  const ministries = [];
  for (const m of MINISTRIES) ministries.push(await prisma.ministry.create({ data: { ...m, churchId: church.id } }));

  const memberIds: string[] = (await prisma.member.findMany({ where: { churchId: church.id }, select: { id: true } })).map((m) => m.id);
  const today = new Date();
  let created = 0;
  while (created < def.members) {
    const last = pick(LAST);
    const size = Math.min(def.members - created, pick([1, 1, 2, 2, 3, 4, 5]));
    const family = size > 1 ? await prisma.family.create({ data: { churchId: church.id, name: `Familia ${last}` } }) : null;
    const address = `${pick(STREETS)} ${between(100, 5000)}, ${def.city}`;
    for (let i = 0; i < size; i++) {
      const isChild = i >= 2;
      const female = i === 1 ? true : i === 0 ? rand() < 0.4 : rand() < 0.5;
      const first = pick(female ? FIRST_F : FIRST_M);
      const age = isChild ? between(3, 17) : between(20, 75);
      const keys: DefaultStatusKey[] = isChild
        ? pick([['asistente'], ['miembro']])
        : pick([['visitante'], ['asistente'], ['miembro'], ['miembro'], ['miembro', 'bautizado'], ['miembro', 'bautizado'], ['bautizado'], ['bautizado', 'inactivo']]);
      const joined = addDays(today, -between(10, 5000));
      const member = await prisma.member.create({
        data: {
          churchId: church.id,
          firstName: first,
          lastName: last,
          email: isChild ? null : `${first}.${last}${between(1, 99)}@mail.com`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''),
          phone: isChild ? null : `+54 9 ${between(11, 351)} ${between(4000, 6999)}-${between(1000, 9999)}`,
          documentId: String(between(isChild ? 50_000_000 : 12_000_000, isChild ? 60_000_000 : 45_000_000)),
          birthDate: day(new Date(today.getFullYear() - age, between(0, 11), between(1, 28))),
          gender: female ? 'FEMALE' : 'MALE',
          address,
          statuses: statusLinks(keys),
          joinedAt: day(joined),
          baptismDate: keys.includes('bautizado') ? day(addDays(joined, between(30, 700))) : null,
          baptized: keys.includes('bautizado'),
          familyId: family?.id,
          familyRole: family ? (i === 0 ? 'Jefe/a de familia' : i === 1 ? 'Cónyuge' : 'Hijo/a') : null,
          createdAt: rand() < 0.08 ? addDays(today, -between(0, 20)) : joined,
        },
      });
      memberIds.push(member.id);
      if (!isChild && rand() < 0.55) {
        const ms = [...ministries].sort(() => rand() - 0.5).slice(0, between(1, 2));
        await prisma.ministryMember.createMany({ data: ms.map((m) => ({ ministryId: m.id, memberId: member.id })) });
      }
      created++;
    }
  }
  const leaders = await prisma.member.findMany({ where: { churchId: church.id, statuses: { some: { statusId: statuses.bautizado } } }, take: ministries.length });
  for (const [i, m] of ministries.entries()) {
    if (leaders[i]) await prisma.ministry.update({ where: { id: m.id }, data: { leaderId: leaders[i].id } });
  }

  // Finanzas: 12 meses de movimientos.
  const accounts = await prisma.financeAccount.findMany({ where: { churchId: church.id } });
  const categories = await prisma.financeCategory.findMany({ where: { churchId: church.id } });
  const acc = (name: string) => accounts.find((a) => a.name === name)!.id;
  const cat = (name: string, type: TransactionType) => categories.find((c) => c.name === name && c.type === type)!.id;
  const tithers = memberIds.sort(() => rand() - 0.5).slice(0, Math.round(memberIds.length * 0.35));
  const tx: Prisma.TransactionCreateManyInput[] = [];
  const base = { churchId: church.id, createdById: users.tesoreria.id };
  const s = def.scale;
  const start = new Date(today.getFullYear(), today.getMonth() - 11, 1);

  for (let d = new Date(start); d <= today; d = addDays(d, 1)) {
    const date = day(d);
    if (d.getDay() === 0) {
      for (const memberId of tithers) {
        if (rand() < 0.6) {
          tx.push({ ...base, type: 'INCOME', accountId: rand() < 0.85 ? acc('Banco') : acc('Caja general'), categoryId: cat('Diezmos', 'INCOME'), memberId, amount: roundTo(between(8000, 90000), 500), date, description: 'Diezmo' });
        }
      }
      tx.push({ ...base, type: 'INCOME', accountId: rand() < 0.6 ? acc('Banco') : acc('Caja general'), categoryId: cat('Ofrendas', 'INCOME'), amount: roundTo(between(90000, 320000) * s, 100), date, description: 'Ofrenda culto dominical' });
      if (rand() < 0.25) {
        tx.push({ ...base, type: 'INCOME', accountId: acc('Fondo en dólares'), categoryId: cat('Ofrendas especiales', 'INCOME'), amount: between(20, 200), date, description: 'Ofrenda misionera en USD' });
      }
    }
    if (d.getDay() === 3 && rand() < 0.7) {
      tx.push({ ...base, type: 'INCOME', accountId: acc('Caja general'), categoryId: cat('Ofrendas', 'INCOME'), amount: roundTo(between(25000, 90000) * s, 100), date, description: 'Ofrenda reunión de oración' });
    }
    if (d.getDate() === 5) {
      tx.push({ ...base, type: 'EXPENSE', accountId: acc('Banco'), categoryId: cat('Alquiler', 'EXPENSE'), amount: roundTo(950000 * s, 1000), date, description: 'Alquiler del templo', reference: `FC-${between(1000, 9999)}` });
      tx.push({ ...base, type: 'EXPENSE', accountId: acc('Banco'), categoryId: cat('Sueldos y honorarios', 'EXPENSE'), amount: roundTo(1400000 * s, 1000), date, description: 'Honorarios pastorales' });
    }
    if (d.getDate() === 12) {
      tx.push({ ...base, type: 'EXPENSE', accountId: acc('Banco'), categoryId: cat('Servicios', 'EXPENSE'), amount: roundTo(between(90000, 180000) * s, 100), date, description: 'Electricidad' });
      tx.push({ ...base, type: 'EXPENSE', accountId: acc('Banco'), categoryId: cat('Servicios', 'EXPENSE'), amount: roundTo(between(25000, 45000) * s, 100), date, description: 'Internet y telefonía' });
      tx.push({ ...base, type: 'EXPENSE', accountId: acc('Caja general'), categoryId: cat('Ayuda social', 'EXPENSE'), amount: roundTo(between(120000, 300000) * s, 100), date, description: 'Alimentos para el comedor comunitario' });
    }
    if (d.getDate() === 20) {
      tx.push({ ...base, type: 'EXPENSE', accountId: acc('Fondo en dólares'), categoryId: cat('Misiones', 'EXPENSE'), amount: between(100, 250), date, description: 'Envío a misioneros' });
    }
    if (rand() < 0.06) {
      tx.push({ ...base, type: 'EXPENSE', accountId: acc('Caja general'), categoryId: cat(pick(['Mantenimiento', 'Equipamiento', 'Eventos', 'Otros egresos']), 'EXPENSE'), amount: roundTo(between(15000, 250000) * s, 100), date, description: pick(['Reparación de sillas', 'Pintura salón', 'Cables y micrófonos', 'Artículos de limpieza', 'Refrigerio evento', 'Librería']) });
    }
    if (rand() < 0.03) {
      tx.push({ ...base, type: 'INCOME', accountId: acc('Banco'), categoryId: cat(pick(['Donaciones', 'Eventos']), 'INCOME'), amount: roundTo(between(50000, 400000) * s, 1000), date, description: pick(['Donación anónima', 'Venta de comidas', 'Retiro de jóvenes', 'Venta solidaria']) });
    }
  }
  await prisma.transaction.createMany({ data: tx });

  // Novedades.
  const author = users.secretaria.id;
  await prisma.announcement.createMany({
    data: [
      { churchId: church.id, authorId: author, pinned: true, title: 'Bienvenidos a Kahal', body: `Desde ahora puedes seguir todas las novedades de ${def.name} desde tu teléfono: actividades, transmisiones en vivo y citas con los pastores.\n\nInstala la app desde el menú de tu navegador con "Agregar a pantalla de inicio".`, publishedAt: addDays(today, -1) },
      { churchId: church.id, authorId: author, title: 'Campaña de alimentos', body: 'Durante todo el mes recibimos alimentos no perecederos para el comedor comunitario. Puedes acercarlos antes o después de cada reunión.', publishedAt: addDays(today, -4) },
      { churchId: church.id, authorId: author, title: 'Inscripciones abiertas: Retiro de jóvenes', body: 'Ya están abiertas las inscripciones para el retiro de jóvenes. Cupos limitados. Consulta con los líderes del ministerio.', publishedAt: addDays(today, -9) },
      { churchId: church.id, authorId: author, title: 'Nuevo horario de reunión de oración', body: 'A partir de este mes la reunión de oración de los miércoles pasa a las 20:00.', publishedAt: addDays(today, -16) },
    ],
  });

  // Eventos próximos.
  const at = (offset: number, h: number, m = 0) => {
    const d = addDays(today, offset);
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), h + 3, m)); // hora Argentina (UTC-3)
  };
  const nextSunday = (7 - today.getDay()) % 7 || 7;
  await prisma.event.createMany({
    data: [
      { churchId: church.id, createdById: author, title: 'Culto dominical', location: def.address, startsAt: at(nextSunday, 10), endsAt: at(nextSunday, 12), description: 'Reunión general con alabanza, predicación y escuela dominical para niños.' },
      { churchId: church.id, createdById: author, title: 'Reunión de oración', location: def.address, startsAt: at(((3 - today.getDay() + 7) % 7) || 7, 20), endsAt: at(((3 - today.getDay() + 7) % 7) || 7, 21, 30) },
      { churchId: church.id, createdById: author, title: 'Noche de jóvenes', location: 'Salón principal', startsAt: at(nextSunday - 1, 20, 30), endsAt: at(nextSunday - 1, 23) },
      { churchId: church.id, createdById: author, title: 'Taller para matrimonios', location: 'Salón anexo', startsAt: at(nextSunday + 6, 17), endsAt: at(nextSunday + 6, 19), description: 'Encuentro mensual con dinámicas y charla.' },
      { churchId: church.id, createdById: author, title: 'Bautismos', location: def.address, startsAt: at(nextSunday + 14, 11), description: 'Celebración de bautismos. Inscríbete con secretaría.' },
      { churchId: church.id, createdById: author, title: 'Retiro de jóvenes', location: 'Quinta El Encuentro', startsAt: at(nextSunday + 26, 9), endsAt: at(nextSunday + 27, 18) },
    ],
  });

  // Transmisiones de ejemplo (editables desde la app).
  await prisma.liveStream.createMany({
    data: [
      { churchId: church.id, title: 'Culto dominical en vivo', url: DEMO_STREAM_URL, platform: 'YOUTUBE', isLive: true, scheduledAt: at(0, 10), description: 'Transmisión de prueba para la demo.' },
      { churchId: church.id, title: 'Culto dominical', url: DEMO_STREAM_URL, platform: 'YOUTUBE', scheduledAt: at(-7, 10) },
      { churchId: church.id, title: 'Reunión de oración', url: DEMO_STREAM_URL, platform: 'YOUTUBE', scheduledAt: at(-4, 20) },
      { churchId: church.id, title: 'Culto dominical', url: DEMO_STREAM_URL, platform: 'YOUTUBE', scheduledAt: at(nextSunday, 10) },
    ],
  });

  // Disponibilidad de pastores y algunas citas.
  await prisma.availability.createMany({
    data: [
      { churchId: church.id, userId: users.pastor.id, weekday: 2, startTime: '18:00', endTime: '21:00', slotMinutes: 30 },
      { churchId: church.id, userId: users.pastor.id, weekday: 4, startTime: '18:00', endTime: '21:00', slotMinutes: 30 },
      { churchId: church.id, userId: users.pastor.id, weekday: 6, startTime: '10:00', endTime: '13:00', slotMinutes: 45 },
      { churchId: church.id, userId: users.equipo.id, weekday: 3, startTime: '17:00', endTime: '19:00', slotMinutes: 30 },
      { churchId: church.id, userId: users.lider.id, weekday: 1, startTime: '19:00', endTime: '21:00', slotMinutes: 30 },
      { churchId: church.id, userId: users.lider.id, weekday: 5, startTime: '17:00', endTime: '20:00', slotMinutes: 60 },
    ],
  });
  const nextWeekday = (wd: number, extraWeeks = 0) => ((wd - today.getDay() + 7) % 7 || 7) + extraWeeks * 7;
  await prisma.appointment.createMany({
    data: [
      { churchId: church.id, hostId: users.pastor.id, requesterId: users.miembro.id, startsAt: at(nextWeekday(2), 18), endsAt: at(nextWeekday(2), 18, 30), status: 'CONFIRMED', reason: 'Consejería familiar' },
      { churchId: church.id, hostId: users.pastor.id, requesterId: users.miembro2.id, startsAt: at(nextWeekday(4), 19), endsAt: at(nextWeekday(4), 19, 30), status: 'PENDING', reason: 'Quiero hablar sobre el bautismo' },
      { churchId: church.id, hostId: users.equipo.id, requesterId: users.miembro2.id, startsAt: at(nextWeekday(3), 17), endsAt: at(nextWeekday(3), 17, 30), status: 'CONFIRMED', reason: 'Acompañamiento en duelo' },
      { churchId: church.id, hostId: users.lider.id, requesterId: users.miembro.id, startsAt: at(nextWeekday(5, 1), 17), endsAt: at(nextWeekday(5, 1), 18), status: 'PENDING', reason: 'Unirme al ministerio de jóvenes' },
      { churchId: church.id, hostId: users.pastor.id, requesterId: users.miembro.id, startsAt: at(-6, 18), endsAt: at(-6, 18, 30), status: 'COMPLETED', reason: 'Oración' },
    ],
  });

  // Artículos de interés.
  await prisma.article.createMany({
    data: [
      {
        churchId: church.id,
        authorId: users.pastor.id,
        title: 'La oración como hábito diario',
        summary: 'Cinco claves prácticas para sostener un tiempo de oración en medio de la rutina.',
        publishedAt: addDays(today, -3),
        body:
          '<p>Muchas veces sabemos que orar es importante, pero nos cuesta sostenerlo en el tiempo. La buena noticia es que la oración no depende de grandes momentos, sino de pequeños pasos fieles.</p>' +
          '<h2>1. Elige un momento fijo</h2><p>Puede ser temprano por la mañana o antes de dormir. Lo importante es que sea <strong>el mismo todos los días</strong>, así se vuelve parte de tu rutina.</p>' +
          '<h2>2. Empieza con poco</h2><p>Diez minutos con el corazón atento valen más que una hora distraída. Con el tiempo, vas a querer quedarte más.</p>' +
          '<h2>3. Usa una guía</h2><ul><li>Adoración: reconoce quién es Dios.</li><li>Confesión: pon delante de Él lo que pesa.</li><li>Gratitud: nombra tres cosas por las que agradecer.</li><li>Pedidos: ora por otros y por ti.</li></ul>' +
          '<blockquote>"Oren sin cesar. Den gracias a Dios en toda situación." — 1 Tesalonicenses 5:17-18</blockquote>' +
          '<h2>4. Escribe</h2><p>Anotar tus oraciones te ayuda a enfocarte y, con el tiempo, a ver cómo Dios fue respondiendo.</p>' +
          '<h2>5. Ora en comunidad</h2><p>Te esperamos los miércoles en la reunión de oración. Orar juntos fortalece la fe de todos.</p>',
      },
      {
        churchId: church.id,
        authorId: users.equipo.id,
        title: 'Cómo acompañar a alguien que atraviesa un duelo',
        summary: 'Orientaciones del equipo pastoral para estar cerca sin palabras de más.',
        publishedAt: addDays(today, -12),
        body:
          '<p>Cuando alguien que queremos pierde a un ser querido, solemos sentir que no sabemos qué decir. Muchas veces, lo más valioso es simplemente <em>estar</em>.</p>' +
          '<h3>Lo que ayuda</h3><ul><li>Escuchar sin apresurarse a dar respuestas.</li><li>Ofrecer ayuda concreta: una comida, un traslado, una tarde de compañía.</li><li>Recordar fechas significativas y volver a escribir semanas después.</li></ul>' +
          '<h3>Lo que conviene evitar</h3><ul><li>Frases hechas que minimizan el dolor.</li><li>Comparar pérdidas.</li><li>Poner plazos para "estar bien".</li></ul>' +
          '<p>Si necesitas acompañamiento, puedes pedir una cita con el equipo pastoral desde la sección <strong>Citas</strong> de la app.</p>',
      },
    ],
  });

  console.log(`[seed] ${def.name}: ${created + staffDefs.length} miembros, ${tx.length} movimientos`);
}

async function main() {
  await ensureSuperAdmin();
  if (process.env.SEED_DEMO !== 'true') return;
  if ((await prisma.church.count()) > 0) {
    console.log('[seed] Ya existen iglesias: se omite la carga de demo');
    return;
  }
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const def of DEMO_CHURCHES) await seedChurch(def, passwordHash);
  console.log(`[seed] Demo lista. Usuarios: pastor|equipo|lider|tesoreria|secretaria|miembro@<iglesia>.demo  Contraseña: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
