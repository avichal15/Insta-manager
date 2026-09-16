import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';
import { createFile } from 'mp4box';

const source = await readFile(new URL('../src/offscreen/mp4-mux.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace(/from ['"]mp4box['"]/, `from ${JSON.stringify(import.meta.resolve('mp4box'))}`);
const { muxMp4 } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const readFixture = async (name) => {
  const bytes = await readFile(new URL(`fixtures/${name}-only.mp4`, import.meta.url));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};

function inspect(buffer) {
  const file = createFile();
  const tracks = new Map();
  file.onReady = (info) => {
    for (const track of info.tracks) {
      tracks.set(track.id, { ...track, extracted: [] });
      file.setExtractionOptions(track.id, undefined, { nbSamples: 500 });
    }
    file.start();
  };
  file.onSamples = (id, _user, samples) => { tracks.get(id).extracted.push(...samples); };
  file.appendBuffer(Object.assign(buffer, { fileStart: 0 }));
  file.flush();
  return [...tracks.values()];
}

test('local MP4 merging preserves encoded video and audio samples and timing', async () => {
  const video = await readFixture('video');
  const audio = await readFixture('audio');
  const originals = [...inspect(video.slice(0)), ...inspect(audio.slice(0))];
  const result = muxMp4(video, audio);
  const tracks = inspect(result.slice(0));
  assert.equal(tracks.length, 2);
  assert.ok(tracks.some((track) => track.video));
  assert.ok(tracks.some((track) => track.audio));
  for (const original of originals) {
    const output = tracks.find((track) => Boolean(track.video) === Boolean(original.video));
    assert.equal(output.codec, original.codec);
    assert.equal(output.timescale, original.timescale);
    assert.equal(output.extracted.length, original.extracted.length);
    const digest = (samples) => createHash('sha256').update(Buffer.concat(samples.map((sample) => sample.data))).digest('hex');
    assert.equal(digest(output.extracted), digest(original.extracted));
    assert.deepEqual(output.extracted.map(({ dts, cts, duration }) => ({ dts, cts, duration })),
      original.extracted.map(({ dts, cts, duration }) => ({ dts, cts, duration })));
  }
  await mkdir(new URL('../work/verification/', import.meta.url), { recursive: true });
  await writeFile(new URL('../work/verification/merged-fixture.mp4', import.meta.url), new Uint8Array(result));
});

test('local MP4 merging rejects wrong tracks, empty files, and truncated samples', async () => {
  const video = await readFixture('video');
  const audio = await readFixture('audio');
  assert.throws(() => muxMp4(audio.slice(0), audio.slice(0)), /video track/);
  assert.throws(() => muxMp4(video.slice(0), video.slice(0)), /audio track/);
  assert.throws(() => muxMp4(new ArrayBuffer(0), audio.slice(0)), /empty|invalid|incomplete/);
  assert.throws(() => muxMp4(video.slice(0, -100), audio.slice(0)), /truncated|incomplete/);
});
