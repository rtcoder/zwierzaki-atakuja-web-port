import test from 'node:test';
import assert from 'node:assert/strict';
import { PhysicsWorld } from '../dist/js/physics.js';

function near(actual, expected, tolerance = 1e-5) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected} by more than ${tolerance}`);
}

function finite(body) {
  for (const key of ['x', 'y', 'vx', 'vy', 'angle', 'angularVelocity']) {
    assert.ok(Number.isFinite(body[key]), `${body.id}.${key} is not finite`);
  }
}

test('source semi-implicit free fall adds gravity before position on every 0.05 step', () => {
  const world = new PhysicsWorld();
  const body = world.add({ id: 'falling', kind: 'circle', radius: 5, mass: 1, x: 3, y: 0, vx: 10 });
  for (let i = 0; i < 10; i++) world.step();
  near(body.x, 8);
  near(body.y, 27.5);
  near(body.vy, 100);
});

test('the recovered slow timestep changes the actual simulation increment', () => {
  const world = new PhysicsWorld();
  const body = world.add({ kind: 'circle', radius: 5, mass: 1 });
  for (let i = 0; i < 3; i++) world.step(0.015);
  near(body.y, 0.27);
  near(body.vy, 9);
});

test('off-center impulses preserve the original box inertia rather than textbook inertia', () => {
  const world = new PhysicsWorld({ gravity: 0 });
  const body = world.add({ kind: 'box', width: 12, height: 6, mass: 2 });
  world.applyImpulse(body, 0, -24, 5, 0);
  near(body.vy, -12);
  near(body.angularVelocity, -1);
  world.step();
  near(body.angle, -0.05);
  near(body.y, -0.6);
});

test('translation and rotation restrictions are independent during impulses and integration', () => {
  const world = new PhysicsWorld();
  const pivot = world.add({ kind: 'box', width: 12, height: 6, mass: 2, canTranslate: false, canRotate: true });
  const slider = world.add({ kind: 'box', x: 100, width: 12, height: 6, mass: 2, canTranslate: true, canRotate: false });
  world.applyImpulse(pivot, 0, -24, 5, 0);
  world.applyImpulse(slider, 0, -24, 105, 0);
  world.step();
  near(pivot.x, 0); near(pivot.y, 0); near(pivot.angle, -0.05);
  near(slider.angle, 0); near(slider.y, -0.1);
});

test('a dropped circle comes to finite rest within the original 0.2 penetration slop', () => {
  const world = new PhysicsWorld();
  world.addGround();
  const body = world.add({ kind: 'circle', radius: 10, x: 0, y: -80, mass: 1 });
  let sawImpact = false;
  for (let i = 0; i < 300; i++) {
    const events = world.step();
    sawImpact = sawImpact || events.some(event => event.impulse > 20);
    finite(body);
  }
  assert.ok(sawImpact);
  assert.ok(body.y + 10 <= 0.205, `circle bottom ${body.y + 10}`);
  near(body.vy, 0, 0.02);
});

test('ground contacts support boxes and triangles without unbounded penetration', () => {
  const world = new PhysicsWorld();
  world.addGround();
  const box = world.add({ kind: 'box', x: -40, y: -50, width: 20, height: 10, mass: 2, angle: 0.12 });
  const triangle = world.add({ kind: 'triangle', x: 40, y: -45, mass: 1, vertices: [{ x: -12, y: 6 }, { x: 0, y: -12 }, { x: 12, y: 6 }] });
  for (let i = 0; i < 300; i++) { world.step(); finite(box); finite(triangle); }
  for (const body of [box, triangle]) {
    assert.ok(body.verticesWorld.every(point => point.y <= 0.23), `${body.kind} penetrated ground`);
    assert.ok(Math.abs(body.vy) < 0.1);
  }
});

test('two equal circles transfer normal momentum and emit measured impact events', () => {
  const world = new PhysicsWorld({ gravity: 0 });
  const left = world.add({ kind: 'circle', x: -9, radius: 10, mass: 1, vx: 20 });
  const right = world.add({ kind: 'circle', x: 9, radius: 10, mass: 1, vx: -20 });
  const events = world.step();
  assert.equal(events.length, 1);
  assert.ok(events[0].impulse > 19.9);
  near(events[0].relativeSpeed, 40);
  near(events[0].relativeNormalSpeed, 40);
  near(left.vx + right.vx, 0);
  assert.ok(left.vx <= 0.01 && right.vx >= -0.01);
  assert.ok(Number.isFinite(events[0].point.x));
  near(Math.hypot(events[0].normal.x, events[0].normal.y), 1);
});

test('damage telemetry preserves absolute normal speed even during separating overlap', () => {
  const world = new PhysicsWorld({ gravity: 0 });
  world.add({ kind: 'circle', x: -9, radius: 10, mass: 1, vx: -10 });
  world.add({ kind: 'circle', x: 9, radius: 10, mass: 1, vx: 10 });
  const [event] = world.step();
  near(event.relativeSpeed, 0);
  near(event.relativeNormalSpeed, 20);
  near(event.impulse, 0);
});

test('a moving circle collides with an immovable rectangle', () => {
  const world = new PhysicsWorld({ gravity: 0 });
  const wall = world.add({ kind: 'box', width: 10, height: 80, canTranslate: false, canRotate: false });
  const ball = world.add({ kind: 'circle', x: -20, radius: 5, mass: 1, vx: 60 });
  let hit = false;
  for (let i = 0; i < 30; i++) {
    const events = world.step();
    hit = hit || events.some(event => event.a === wall || event.b === wall);
  }
  assert.ok(hit);
  assert.ok(ball.x <= -9.79, `circle crossed wall: ${ball.x}`);
  near(wall.x, 0); near(wall.angle, 0);
});

test('circle-triangle collision produces a sloping surface normal', () => {
  const world = new PhysicsWorld({ gravity: 0 });
  world.add({ kind: 'triangle', vertices: [{ x: -20, y: 10 }, { x: 0, y: -20 }, { x: 20, y: 10 }], canTranslate: false, canRotate: false });
  // The center is 4.44 units outside the left slope, inside a radius-5 contact.
  const ball = world.add({ kind: 'circle', x: -14, y: -7, radius: 5, mass: 1, vx: 20, vy: 10 });
  const events = world.step();
  assert.ok(events.length > 0);
  assert.ok(Math.abs(events[0].normal.x) > 0.3 && Math.abs(events[0].normal.y) > 0.3);
  finite(ball);
});

test('friction removes horizontal sliding speed on the ground', () => {
  const world = new PhysicsWorld();
  world.addGround();
  const body = world.add({ kind: 'box', x: 0, y: -5, width: 20, height: 10, mass: 2, vx: 40 });
  for (let i = 0; i < 100; i++) world.step();
  assert.ok(Math.abs(body.vx) < 0.05, `remaining sliding speed ${body.vx}`);
});

test('circle tangential drag samples velocity before warm-start impulses', () => {
  const world = new PhysicsWorld();
  world.addGround();
  const ball = world.add({ kind: 'circle', y: -10, radius: 10, mass: 1, vx: 100 });
  world.step();
  near(ball.vx, 84.333333, 1e-4);
  near(ball.angularVelocity, 1.8, 1e-5);
  world.step();
  near(ball.vx, 69.711111, 1e-4);
  near(ball.angularVelocity, 3.6, 1e-5);
});

test('TYPE6-style sensor projectiles report hits without contact impulses', () => {
  const world = new PhysicsWorld({ gravity: 0 });
  const block = world.add({ kind: 'box', x: 0, width: 10, height: 20, mass: 2 });
  const particle = world.add({ kind: 'circle', x: -6, radius: 2, mass: 1, vx: 20, sensor: true });
  const [event] = world.step();
  assert.ok(event);
  near(event.relativeNormalSpeed, 20);
  near(event.impulse, 0);
  near(particle.vx, 20);
  near(block.vx, 0);
});

test('rectangle-triangle and triangle-triangle pairs generate finite contacts', () => {
  for (const kind of ['box', 'triangle']) {
    const world = new PhysicsWorld({ gravity: 0 });
    const first = world.add({ kind, width: 20, height: 20, vertices: [{ x: -10, y: 10 }, { x: 0, y: -20 }, { x: 10, y: 10 }], mass: 1, x: 0, y: 0 });
    const second = world.add({ kind: 'triangle', vertices: [{ x: -10, y: 10 }, { x: 0, y: -20 }, { x: 10, y: 10 }], mass: 1, x: 8, y: 0, vx: -20 });
    const events = world.step();
    assert.ok(events.length > 0, `${kind}-triangle did not collide`);
    for (let i = 0; i < 20; i++) world.step();
    finite(first); finite(second);
  }
});

test('a stack of two boxes stays supported after settling', () => {
  const world = new PhysicsWorld();
  world.addGround();
  const lower = world.add({ kind: 'box', x: 0, y: -5, width: 30, height: 10, mass: 2 });
  const upper = world.add({ kind: 'box', x: 0, y: -15, width: 20, height: 10, mass: 1 });
  for (let i = 0; i < 400; i++) world.step();
  finite(lower); finite(upper);
  assert.ok(lower.y < -4.7 && upper.y < -14.4);
  assert.ok(Math.abs(upper.vy) < 0.05);
});

test('compound children share rigid motion and participate individually in collision events', () => {
  const world = new PhysicsWorld();
  world.addGround();
  const compound = world.add({ id: 'arch', kind: 'compound', children: [
    { id: 'left', kind: 'box', x: -10, y: -30, width: 10, height: 10, mass: 1 },
    { id: 'right', kind: 'circle', x: 10, y: -30, radius: 5, mass: 1 }
  ] });
  let childImpact = false;
  for (let i = 0; i < 250; i++) {
    const events = world.step();
    childImpact = childImpact || events.some(event => event.a.parent === compound || event.b.parent === compound);
    finite(compound);
  }
  assert.ok(childImpact);
  near(Math.hypot(compound.children[1].x - compound.children[0].x, compound.children[1].y - compound.children[0].y), 20, 1e-4);
  assert.ok(compound.children[1].y + 5 < 0.25);
});

test('removal stops a body from integrating and clears its contacts', () => {
  const world = new PhysicsWorld();
  const body = world.add({ kind: 'circle', radius: 5 });
  world.remove(body);
  assert.ok(!world.bodies.includes(body));
  assert.deepEqual(world.step(), []);
  near(body.y, 0);
});

test('removing a compound end piece preserves the remaining connected rigid section', () => {
  const world = new PhysicsWorld({ gravity: 0 });
  const compound = world.add({ kind: 'compound', children: [-10, 0, 10].map((x, i) => ({ id: `part-${i}`, kind: 'box', x, width: 10, height: 10, mass: 1 })) });
  const originalMiddle = compound.children[1];
  world.remove(compound.children[0]);
  assert.equal(world.bodies.length, 1);
  assert.equal(world.bodies[0].kind, 'compound');
  assert.equal(world.bodies[0].children.length, 2);
  assert.ok(world.bodies[0].children.includes(originalMiddle));
});

test('removing a compound bridge separates components with their existing point velocities', () => {
  const world = new PhysicsWorld({ gravity: 0 });
  const compound = world.add({ kind: 'compound', angularVelocity: 2, children: [-10, 0, 10].map(x => ({ kind: 'box', x, width: 10, height: 10, mass: 1 })) });
  const [left, middle, right] = compound.children;
  world.remove(middle);
  assert.equal(world.bodies.length, 2);
  assert.ok(world.bodies.includes(left) && world.bodies.includes(right));
  near(left.vy, -20); near(right.vy, 20);
  near(left.angularVelocity, 2); near(right.angularVelocity, 2);
});

test('breaking the grounded support releases a previously fixed compound section', () => {
  const world = new PhysicsWorld();
  world.addGround();
  const compound = world.add({ kind: 'compound', canTranslate: false, canRotate: false, children: [-5, -15, -25].map(y => ({ kind: 'box', y, width: 10, height: 10, mass: 1 })) });
  world.remove(compound.children[0]);
  const section = world.bodies.find(body => body.kind === 'compound');
  assert.ok(section?.canTranslate && section.canRotate);
  world.step();
  near(section.vy, 10);
});

test('flight stepping leaves inactive structures suspended until full settling starts', () => {
  const world = new PhysicsWorld();
  world.addGround();
  const structure = world.add({ kind: 'box', x: 100, y: -100, width: 10, height: 10, mass: 1 });
  const projectile = world.add({ kind: 'circle', x: -100, y: -30, radius: 5, mass: 1 });
  world.step(0.05, { activeBodies: new Set([projectile]) });
  near(projectile.y, -29.5);
  near(structure.y, -100); near(structure.vy, 0);
  world.step();
  near(structure.y, -99.5); near(structure.vy, 10);
});

test('flight contacts transfer momentum to a passive structure before its position is integrated', () => {
  const world = new PhysicsWorld({ gravity: 0 });
  const structure = world.add({ kind: 'box', width: 10, height: 20, mass: 2 });
  const projectile = world.add({ kind: 'circle', x: -6, radius: 2, mass: 1, vx: 30 });
  const events = world.step(0.05, { activeBodies: new Set([projectile]) });
  assert.equal(events.length, 1);
  near(structure.x, 0);
  assert.ok(structure.vx > 0);
  world.step();
  assert.ok(structure.x > 0);
});
