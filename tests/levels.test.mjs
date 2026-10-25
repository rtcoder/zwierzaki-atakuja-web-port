import test from 'node:test';
import assert from 'node:assert/strict';

// These expectations were transcribed from the original level factory before
// building the extractor. They pin the source data rather than its serializer.
const api = await import('../dist/js/levels.js').catch(() => null);
const level = (id, options) => {
  assert.ok(api, 'The extracted original-level module must exist');
  return api.getLevel(id, options);
};
const round = n => Math.round(n * 10000) / 10000;
const allBodies = l => {
  const out = [];
  const visit = b => {
    out.push(b);
    b.children?.forEach(visit);
  };
  [...l.bodies, ...(l.compounds ?? [])].forEach(visit);
  return out;
};

test('all 50 original stages are present once, with usable geometry and ammunition', () => {
  assert.ok(api, 'The extracted original-level module must exist');
  assert.equal(api.LEVEL_COUNT, 50);
  assert.deepEqual(api.LEVELS.map(l => l.id), Array.from({length: 50}, (_, i) => i + 1));
  for (const spec of api.LEVELS) {
    assert.ok(spec.ammo.length > 0, `stage ${spec.id} ammunition`);
    assert.ok(spec.ammo.every(id => Number.isInteger(id) && id >= 0 && id <= 4));
    const bodies = allBodies(spec);
    assert.ok(bodies.some(b => b.isTarget), `stage ${spec.id} targets`);
    assert.ok(bodies.some(b => !b.isTarget && b.kind !== 'compound'), `stage ${spec.id} structure`);
    assert.ok(Number.isFinite(spec.launcher.x) && Number.isFinite(spec.launcher.y));
    assert.equal(spec.ground.y, 0);
    const ids = bodies.map(b => b.id);
    assert.equal(new Set(ids).size, ids.length, `stage ${spec.id} stable unique body IDs`);
    for (const body of bodies) {
      assert.ok(Number.isFinite(body.x) && Number.isFinite(body.y), `${body.id} position`);
      assert.ok(Number.isFinite(body.mass) && body.mass > 0, `${body.id} mass`);
      assert.ok(Number.isFinite(body.angle), `${body.id} angle`);
      if (body.vertices) assert.ok(body.vertices.flat().every(Number.isFinite), `${body.id} vertices`);
    }
  }
});

test('first stage keeps the three skunks, original five beams, and two normal bears', () => {
  const spec = level(1);
  assert.deepEqual(spec.ammo, [1, 1, 1]);
  assert.deepEqual(spec.bodies.filter(b => b.kind === 'box').map(b => [b.x,b.y,b.width,b.height]).sort((a,b) => a[0]-b[0] || a[1]-b[1]), [
    [-90,-50,20,100],[-50,-110,100,20],[0,-50,20,100],[50,-110,100,20],[90,-50,20,100]
  ]);
  assert.deepEqual(spec.bodies.filter(b => b.isTarget).map(b => [b.x,b.y,b.radius]).sort((a,b) => a[0]-b[0]), [
    [-45,-20,20],[45,-20,20]
  ]);
  assert.equal(spec.launcher.x, -800);
  assert.equal(spec.launcher.y, -100);
  assert.equal(spec.launcher.shotOffsetY, -8);
});

test('first-stage roof triangles preserve bounding-box placement and mass centers', () => {
  const roofs = level(1).bodies.filter(b => b.kind === 'triangle').sort((a,b) => a.x-b.x);
  assert.equal(roofs.length, 2);
  assert.ok(Math.abs(roofs[0].y + 133.3333333333) < 0.00002);
  const worldVertices = roofs.map(b => b.vertices.map(([x,y]) => [round(x+b.x),round(y+b.y)]));
  assert.deepEqual(worldVertices, [
    [[-100,-120],[-50,-160],[0,-120]],
    [[0,-120],[50,-160],[100,-120]]
  ]);
});

test('tutorial adds the original two extra bears without changing normal stage one', () => {
  const spec = level(1, {tutorial:true});
  assert.deepEqual(spec.bodies.filter(b => b.isTarget).map(b => [b.x,b.y,b.radius]).sort((a,b) => a[0]-b[0]), [
    [-203,-13,13],[-150,-20,20],[-45,-20,20],[45,-20,20]
  ]);
  assert.equal(level(1).bodies.filter(b => b.isTarget).length, 2);
});

test('stage seven retains its rigid compound and boss stages retain their actual barrel', () => {
  assert.ok(level(7).compounds.length > 0);
  for (const id of [10,20,30,40,50]) {
    const spec = level(id);
    assert.ok(spec.boss, `stage ${id} boss metadata`);
    assert.ok(allBodies(spec).some(b => b.id === spec.boss.barrelBodyId), `stage ${id} barrel reference`);
    assert.ok(spec.boss.muzzleDistance > 0);
  }
});

test('stage ten subtracts cannon offsets in the original vector coordinate convention', () => {
  const spec = level(10);
  const barrel = allBodies(spec).find(b => b.id === spec.boss.barrelBodyId);
  // Source q.b(dx,dy) subtracts. Center (-60,-50), minus 50 along
  // the 30-degree barrel, then the compound translation (-10,-30).
  assert.ok(Math.abs(barrel.x - (-113.30127)) < 0.0001);
  assert.ok(Math.abs(barrel.y - (-105)) < 0.0001);
  const muzzlePiece = allBodies(spec).find(b => b.kind === 'box' && b.width === 40 && b.height === 30);
  assert.ok(Math.abs(muzzlePiece.x - (-173.05702)) < 0.0001);
  assert.ok(Math.abs(muzzlePiece.y - (-139.5)) < 0.0001);
});

test('stage forty-four divides cliff dimensions before choosing its slope direction', () => {
  const cliff = level(44).compounds[0];
  // Original c.a(Vector,int,int,int,boolean,int), bytecode offsets 14-23,
  // divides both rounded dimensions by 32 before the type branch at offset 37.
  // For (260,128,0,false,0), the first three columns are 32 units wide.
  assert.deepEqual(cliff.children.filter(b=>b.kind==='box').slice(0,3).map(b=>[
    round(b.x),round(b.y),b.width,b.height
  ]), [
    [16,-64,32,128],[48,-48,32,96],[80,-16,32,32]
  ]);
});

test('getLevel returns independent copies and rejects nonexistent stages', () => {
  const a = level(1);
  a.ammo.push(4);
  a.bodies[0].x = 99999;
  assert.deepEqual(level(1).ammo, [1,1,1]);
  assert.notEqual(level(1).bodies[0].x, 99999);
  assert.throws(() => api.getLevel(0), RangeError);
  assert.throws(() => api.getLevel(51), RangeError);
});
