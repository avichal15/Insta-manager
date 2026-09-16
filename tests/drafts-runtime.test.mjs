import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

const source = await readFile(new URL('../dist/drafts.js', import.meta.url), 'utf8');

function api() {
  const context = { Blob, DOMException, IDBKeyRange, indexedDB, console };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context.InstaManagerDrafts;
}

test('draft media persists in order and remains isolated by Instagram account', async () => {
  const drafts = api();
  await drafts.saveDraft('1001', { id: 'draft-one', type: 'post', caption: 'carousel', createdAt: 1, updatedAt: 1 }, [
    { id: 'second', name: 'second.jpg', type: 'image/jpeg', size: 1, blob: new Blob(['b'], { type: 'image/jpeg' }) },
    { id: 'first', name: 'first.jpg', type: 'image/jpeg', size: 1, blob: new Blob(['a'], { type: 'image/jpeg' }) },
  ]);
  assert.deepEqual((await drafts.getDraft('1001', 'draft-one')).media.map(({ name }) => name), ['second.jpg', 'first.jpg']);
  assert.equal(await drafts.getDraft('2002', 'draft-one'), null);
});

test('draft quota failures preserve the previously saved draft transactionally', async () => {
  const drafts = api();
  await drafts.saveDraft('1001', { id: 'draft-quota', type: 'reel', caption: 'safe', createdAt: 1, updatedAt: 1 }, [
    { id: 'safe', name: 'safe.mp4', type: 'video/mp4', size: 4, blob: new Blob(['safe']) },
  ]);
  await assert.rejects(drafts.saveDraft('1001', { id: 'draft-quota', type: 'reel', caption: 'too large', createdAt: 1, updatedAt: 2 }, [
    { id: 'huge', name: 'huge.mp4', type: 'video/mp4', size: drafts.MAX_FILE_BYTES + 1, blob: new Blob(['x']) },
  ]), /250 MB/);
  assert.equal((await drafts.getDraft('1001', 'draft-quota')).caption, 'safe');
});

test('deleting and cleaning drafts removes their media blobs without crossing accounts', async () => {
  const drafts = api();
  const record = (id) => ({ id, type: 'story', caption: id, createdAt: 1, updatedAt: 1 });
  const media = (id) => [{ id, name: `${id}.jpg`, type: 'image/jpeg', size: 1, blob: new Blob([id]) }];
  await drafts.saveDraft('1001', record('keep'), media('keep'));
  await drafts.saveDraft('1001', record('remove'), media('remove'));
  await drafts.saveDraft('2002', record('other'), media('other'));
  await drafts.deleteDraft('1001', 'remove');
  await drafts.cleanupDrafts('1001', ['keep']);
  assert.equal(await drafts.getDraft('1001', 'remove'), null);
  assert.equal((await drafts.getDraft('1001', 'keep')).media.length, 1);
  assert.equal((await drafts.getDraft('2002', 'other')).media.length, 1);
});
