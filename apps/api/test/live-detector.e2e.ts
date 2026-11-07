/**
 * Prueba de la detección automática de transmisiones, contra la base y con plataformas simuladas.
 *
 *   DATABASE_URL=... npm run test:live
 *
 * Crea y borra sus propias iglesias, pero usa solo una base de pruebas: nunca la de producción.
 */
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { CampusAspect, PrismaClient, StreamPlatform } from '@prisma/client';
import { ContentService } from '../src/content/content.service';
import { LiveDetectorService } from '../src/content/live-detector.service';
import type { TwitchStream, YouTubeVideo } from '../src/content/live-platforms';

const db = new PrismaClient();
const CHANNEL = 'UCtest';
const LOGIN = 'iglesia';

describe('detección automática de transmisiones', () => {
  let churchId: string;
  let slug: string;
  let videos: YouTubeVideo[];
  let feed: string[];
  let streams: TwitchStream[];
  let youtubeDown: boolean;
  let queried: string[][];
  let pushes: { body: string; campusId?: string | null }[];
  let blocked: boolean;
  let detector: LiveDetectorService;

  const video = (id: string, state: YouTubeVideo['state'] = 'live'): YouTubeVideo => ({ id, channelId: CHANNEL, title: `Culto ${id}`, state, startedAt: new Date() });
  const rows = () => db.liveStream.findMany({ where: { churchId }, orderBy: { createdAt: 'asc' } });
  const makeDetector = () =>
    new LiveDetectorService(
      db as never,
      {
        configured: true,
        channelId: async () => CHANNEL,
        feedVideoIds: async () => feed,
        videos: async (ids: string[]) => {
          queried.push(ids);
          if (youtubeDown) throw new Error('caída');
          return videos.filter((v) => ids.includes(v.id));
        },
      } as never,
      {
        configured: true,
        login: (url: string) => new URL(url).pathname.slice(1).toLowerCase() || null,
        streams: async () => streams,
        recordingUrl: async (_: string, id: string) => `https://www.twitch.tv/videos/${id}`,
      } as never,
      { sendToChurch: async (_: string, p: { body: string }, __: unknown, campusId?: string | null) => void pushes.push({ body: p.body, campusId }) } as never,
      { isBlocked: async () => blocked } as never,
    );

  beforeEach(async () => {
    await cleanup();
    slug = `live-${randomBytes(4).toString('hex')}`;
    const church = await db.church.create({
      data: { name: 'Iglesia en vivo', slug, youtubeUrl: 'https://www.youtube.com/@iglesia', twitchUrl: `https://www.twitch.tv/${LOGIN}` },
    });
    churchId = church.id;
    videos = [];
    feed = [];
    streams = [];
    youtubeDown = false;
    queried = [];
    pushes = [];
    blocked = false;
    detector = makeDetector();
  });

  const created: string[] = [];
  const cleanup = async () => {
    if (churchId) created.push(churchId);
    await db.church.deleteMany({ where: { id: { in: created } } });
  };

  after(async () => {
    await cleanup();
    await db.$disconnect();
  });

  it('publica una transmisión nueva, avisa una sola vez y la termina al cortar', async () => {
    feed = ['a'];
    videos = [video('a')];
    await detector.detect();
    await detector.detect();
    let [row, ...rest] = await rows();
    assert.equal(rest.length, 0);
    assert.equal(row.isLive, true);
    assert.equal(row.url, 'https://www.youtube.com/watch?v=a');
    assert.equal(row.campusId, null);
    assert.deepEqual(pushes, [{ body: 'En vivo ahora: Culto a', campusId: null }]);

    videos = [video('a', 'none')];
    await detector.detect();
    [row] = await rows();
    assert.equal(row.isLive, false);
    assert.equal(row.url, 'https://www.youtube.com/watch?v=a');
  });

  it('no gasta cuota otra vez en un video terminado', async () => {
    feed = ['viejo'];
    videos = [video('viejo', 'none')];
    await detector.detect();
    queried = [];
    await detector.detect();
    assert.deepEqual(queried, []);
    assert.equal((await rows()).length, 0);
    assert.deepEqual(pushes, []);
  });

  it('sigue consultando un video programado hasta que empieza', async () => {
    feed = ['b'];
    videos = [video('b', 'upcoming')];
    await detector.detect();
    assert.equal((await rows()).length, 0);
    videos = [video('b')];
    await detector.detect();
    assert.equal((await rows())[0].isLive, true);
  });

  it('no termina nada si la plataforma no responde', async () => {
    feed = ['a'];
    videos = [video('a')];
    await detector.detect();
    youtubeDown = true;
    videos = [];
    await detector.detect();
    assert.equal((await rows())[0].isLive, true);
  });

  it('no reabre una transmisión finalizada a mano', async () => {
    feed = ['a'];
    videos = [video('a')];
    await detector.detect();
    await db.liveStream.updateMany({ where: { churchId }, data: { isLive: false } });
    await detector.detect();
    assert.equal((await rows())[0].isLive, false);
    assert.equal(pushes.length, 1);
  });

  it('no publica de nuevo una transmisión eliminada mientras seguía en vivo', async () => {
    await db.church.update({ where: { id: churchId }, data: { ignoredLiveIds: ['a'] } });
    feed = ['a'];
    videos = [video('a')];
    await detector.detect();
    assert.equal((await rows()).length, 0);
  });

  it('reconoce la transmisión programada a mano y conserva su título y su sede', async () => {
    const campus = await db.campus.create({ data: { churchId, name: 'Norte' } });
    await db.church.update({ where: { id: churchId }, data: { campusesEnabled: true, campusSeparated: [CampusAspect.STREAMS] } });
    await db.liveStream.create({
      data: { churchId, title: 'Culto dominical', platform: StreamPlatform.YOUTUBE, url: 'https://youtube.com/@Iglesia/', scheduledAt: new Date(), campusId: campus.id },
    });
    feed = ['a'];
    videos = [video('a')];
    await detector.detect();
    const [row, ...rest] = await rows();
    assert.equal(rest.length, 0);
    assert.equal(row.title, 'Culto dominical');
    assert.equal(row.campusId, campus.id);
    assert.equal(row.externalId, 'a');
    assert.equal(row.url, 'https://www.youtube.com/watch?v=a');
    assert.deepEqual(pushes, [{ body: 'En vivo ahora: Culto dominical', campusId: campus.id }]);
  });

  it('no avisa si ya estaba marcada en vivo a mano con el mismo video', async () => {
    await db.liveStream.create({ data: { churchId, title: 'A mano', platform: StreamPlatform.YOUTUBE, url: 'https://youtu.be/a', isLive: true } });
    feed = ['a'];
    videos = [video('a')];
    await detector.detect();
    const [row, ...rest] = await rows();
    assert.equal(rest.length, 0);
    assert.equal(row.externalId, 'a');
    assert.deepEqual(pushes, []);
  });

  it('una transmisión detectada reemplaza a otra manual en curso', async () => {
    await db.liveStream.create({ data: { churchId, title: 'Olvidada', platform: StreamPlatform.FACEBOOK, url: 'https://facebook.com/x', isLive: true } });
    feed = ['a'];
    videos = [video('a')];
    await detector.detect();
    const live = (await rows()).filter((r) => r.isLive);
    assert.deepEqual(live.map((r) => r.externalId), ['a']);
  });

  it('con YouTube y Twitch a la vez sigue una sola, sin alternarlas', async () => {
    feed = ['a'];
    videos = [video('a')];
    streams = [{ id: '900', login: LOGIN, title: 'Twitch', startedAt: new Date() }];
    await detector.detect();
    await detector.detect();
    const all = await rows();
    assert.deepEqual(all.map((r) => [r.externalId, r.isLive]), [['a', true]]);
    assert.equal(pushes.length, 1);
  });

  it('en Twitch espera antes de terminar, guarda la grabación y no avisa de nuevo al reiniciar', async () => {
    feed = [];
    streams = [{ id: '1', login: LOGIN, title: 'Twitch', startedAt: new Date() }];
    await detector.detect();
    streams = [];
    await detector.detect();
    await detector.detect();
    assert.equal((await rows())[0].isLive, true);
    await detector.detect();
    const [ended] = await rows();
    assert.equal(ended.isLive, false);
    assert.equal(ended.url, 'https://www.twitch.tv/videos/1');

    streams = [{ id: '2', login: LOGIN, title: 'Twitch', startedAt: new Date() }];
    await detector.detect();
    assert.equal((await rows()).filter((r) => r.isLive).length, 1);
    assert.equal(pushes.length, 1);
  });

  describe('acciones manuales sobre una transmisión detectada', () => {
    const editor = { id: 'editor', campusSeparated: [], campusScopes: { STREAMS: null }, audiences: { STREAMS: null } } as never;
    const content = () => new ContentService(db as never, { log: async () => undefined } as never, { sendToChurch: async () => undefined } as never);
    const detected = async () => {
      feed = ['a'];
      videos = [video('a')];
      await detector.detect();
      return (await rows())[0];
    };

    it('eliminarla en vivo evita que se publique de nuevo', async () => {
      const row = await detected();
      await content().removeStream(churchId, editor, row.id);
      await detector.detect();
      assert.equal((await rows()).length, 0);
      assert.equal(pushes.length, 1);
    });

    it('eliminar una ya terminada no la agrega a las ignoradas', async () => {
      const row = await detected();
      videos = [video('a', 'none')];
      await detector.detect();
      await content().removeStream(churchId, editor, row.id);
      const church = await db.church.findUniqueOrThrow({ where: { id: churchId } });
      assert.deepEqual(church.ignoredLiveIds, []);
    });

    it('finalizarla a mano la mantiene apagada', async () => {
      const row = await detected();
      await content().setLive(churchId, editor, row.id, false);
      await detector.detect();
      const [after] = await rows();
      assert.equal(after.isLive, false);
      assert.equal(after.externalId, 'a');
    });

    it('encenderla a mano la saca de la detección', async () => {
      const row = await detected();
      videos = [video('a', 'none')];
      await detector.detect();
      await content().setLive(churchId, editor, row.id, true);
      await detector.detect();
      const [manual] = await rows();
      assert.equal(manual.isLive, true);
      assert.equal(manual.externalId, null);
    });

    it('cambiar el enlace la saca de la detección', async () => {
      const row = await detected();
      await content().updateStream(churchId, editor, row.id, { title: row.title, url: 'https://www.facebook.com/otra', isLive: true });
      const [edited] = await rows();
      assert.equal(edited.externalId, null);
      assert.equal(edited.platform, 'FACEBOOK');
    });
  });

  it('respeta la opción de la iglesia y el bloqueo por falta de pago, pero termina lo que ya estaba en vivo', async () => {
    feed = ['a'];
    videos = [video('a')];
    blocked = true;
    await detector.detect();
    assert.equal((await rows()).length, 0);

    blocked = false;
    await db.church.update({ where: { id: churchId }, data: { autoLiveEnabled: false } });
    await detector.detect();
    assert.equal((await rows()).length, 0);

    await db.church.update({ where: { id: churchId }, data: { autoLiveEnabled: true } });
    await detector.detect();
    assert.equal((await rows())[0].isLive, true);

    await db.church.update({ where: { id: churchId }, data: { autoLiveEnabled: false } });
    videos = [video('a', 'none')];
    await detector.detect();
    assert.equal((await rows())[0].isLive, false);
  });
});
