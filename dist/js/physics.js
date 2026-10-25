/**
 * Zwierzaki Atakują's source-based rigid-body simulation.
 * Equations: v, z, aa, ad, af, aj, ai, bf and bg in the recovered Nokia build.
 * The convex contact manifold implementation is reconstructed; see docs/physics.md.
 * Coordinates are ground-relative, with positive Y downward. No browser dependency.
 */

const SLOP = 0.2;
const FRICTION = 0.9;
const EPSILON = 1e-7;
const f32 = Math.fround;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const cross = (a, b) => a.x * b.y - a.y * b.x;
const dot = (a, b) => a.x * b.x + a.y * b.y;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a, value) => ({ x: a.x * value, y: a.y * value });
const length = a => Math.hypot(a.x, a.y);
const unit = a => { const size = length(a); return size > EPSILON ? mul(a, 1 / size) : { x: 1, y: 0 }; };
const rotate = (p, angle) => ({ x: Math.cos(angle) * p.x - Math.sin(angle) * p.y, y: Math.sin(angle) * p.x + Math.cos(angle) * p.y });
const value = (input, fallback = 0) => Number.isFinite(input) ? input : fallback;

function polygonArea(vertices) {
  let twiceArea = 0;
  for (let i = 0; i < vertices.length; i++) twiceArea += cross(vertices[i], vertices[(i + 1) % vertices.length]);
  return twiceArea / 2;
}

function rootOf(body) { return body.parent || body; }
function linkKey(a, b) { return a._uid < b._uid ? `${a._uid}:${b._uid}` : `${b._uid}:${a._uid}`; }

function updatePrimitive(body) {
  if (body.kind === 'circle') {
    body.verticesWorld = [];
    body._bounds = { minX: body.x - body.radius, maxX: body.x + body.radius, minY: body.y - body.radius, maxY: body.y + body.radius };
    return;
  }
  if (body.kind === 'ground') return;
  body.verticesWorld = body.vertices.map(vertex => {
    const transformed = rotate(vertex, body.angle);
    return { x: transformed.x + body.x, y: transformed.y + body.y };
  });
  body._normals = body.verticesWorld.map((vertex, i) => {
    const edge = sub(body.verticesWorld[(i + 1) % body.verticesWorld.length], vertex);
    return unit(body._winding > 0 ? { x: edge.y, y: -edge.x } : { x: -edge.y, y: edge.x });
  });
  body._bounds = {
    minX: Math.min(...body.verticesWorld.map(p => p.x)), maxX: Math.max(...body.verticesWorld.map(p => p.x)),
    minY: Math.min(...body.verticesWorld.map(p => p.y)), maxY: Math.max(...body.verticesWorld.map(p => p.y))
  };
}

function updateBody(body) {
  if (body.kind !== 'compound') { updatePrimitive(body); return; }
  for (const child of body.children) {
    const offset = rotate(child._offset, body.angle);
    child.x = body.x + offset.x;
    child.y = body.y + offset.y;
    child.angle = body.angle + child._localAngle;
    child.vx = body.vx - body.angularVelocity * offset.y;
    child.vy = body.vy + body.angularVelocity * offset.x;
    child.angularVelocity = body.angularVelocity;
    updatePrimitive(child);
  }
}

function velocityAt(body, offset, correction = false) {
  const angular = correction ? body._biasAngular : body.angularVelocity;
  return {
    x: (correction ? body._biasX : body.vx) - angular * offset.y,
    y: (correction ? body._biasY : body.vy) + angular * offset.x
  };
}

function impulse(body, ix, iy, offset, correction = false) {
  if (correction) {
    body._biasX += ix * body.inverseMass;
    body._biasY += iy * body.inverseMass;
    body._biasAngular += (offset.x * iy - offset.y * ix) * body.inverseInertia;
  } else {
    body.vx += ix * body.inverseMass;
    body.vy += iy * body.inverseMass;
    body.angularVelocity += (offset.x * iy - offset.y * ix) * body.inverseInertia;
  }
}

function applyPair(contact, normalImpulse, tangentImpulse = 0, correction = false) {
  const ix = contact.normal.x * normalImpulse + contact.tangent.x * tangentImpulse;
  const iy = contact.normal.y * normalImpulse + contact.tangent.y * tangentImpulse;
  impulse(contact.rootA, ix, iy, contact.rA, correction);
  impulse(contact.rootB, -ix, -iy, contact.rB, correction);
}

function contact(a, b, pointA, pointB, normal, separation, feature) {
  const rootA = rootOf(a), rootB = rootOf(b);
  const rA = sub(pointA, rootA), rB = sub(pointB, rootB);
  const relative = sub(velocityAt(rootA, rA), velocityAt(rootB, rB));
  return {
    a, b, rootA, rootB, rA, rB, normal,
    tangent: { x: normal.y, y: -normal.x }, separation,
    point: mul(add(pointA, pointB), 0.5),
    key: `${a._uid}:${b._uid}:${feature}`,
    relativeSpeed: Math.max(0, -dot(relative, normal)),
    relativeNormalSpeed: Math.abs(dot(relative, normal)),
    normalImpulse: 0, tangentImpulse: 0, biasImpulse: 0
  };
}

function groundContacts(shape, ground) {
  if (shape.kind === 'circle') {
    const y = shape.y + shape.radius;
    return y >= ground.y - EPSILON ? [contact(shape, ground, { x: shape.x, y }, { x: shape.x, y: ground.y }, { x: 0, y: -1 }, ground.y - y, 'circle-ground')] : [];
  }
  const penetrating = shape.verticesWorld.map((point, index) => ({ point, index })).filter(({ point }) => point.y >= ground.y - EPSILON);
  if (penetrating.length > 2) {
    penetrating.sort((a, b) => a.point.x - b.point.x);
    penetrating.splice(1, penetrating.length - 2);
  }
  return penetrating.map(({ point, index }) => contact(shape, ground, point, { x: point.x, y: ground.y }, { x: 0, y: -1 }, ground.y - point.y, `ground-${index}`));
}

function circles(a, b) {
  const delta = sub(a, b), distance = length(delta), radius = a.radius + b.radius;
  if (distance > radius + EPSILON) return [];
  const normal = unit(delta);
  return [contact(a, b, sub(a, mul(normal, a.radius)), add(b, mul(normal, b.radius)), normal, distance - radius, 'circles')];
}

function closestOnSegment(point, start, end) {
  const edge = sub(end, start);
  const t = clamp(dot(sub(point, start), edge) / Math.max(EPSILON, dot(edge, edge)), 0, 1);
  return { point: add(start, mul(edge, t)), t };
}

function circlePolygon(circle, polygon, flip = false) {
  let maxDistance = -Infinity, face = 0;
  for (let i = 0; i < polygon.verticesWorld.length; i++) {
    const signed = dot(sub(circle, polygon.verticesWorld[i]), polygon._normals[i]);
    if (signed > circle.radius + EPSILON) return [];
    if (signed > maxDistance) { maxDistance = signed; face = i; }
  }
  let normal, boundary, separation, feature;
  if (maxDistance <= 0) {
    normal = polygon._normals[face];
    boundary = sub(circle, mul(normal, maxDistance));
    separation = maxDistance - circle.radius;
    feature = `face-${face}`;
  } else {
    let bestDistance = Infinity;
    for (let i = 0; i < polygon.verticesWorld.length; i++) {
      const nearest = closestOnSegment(circle, polygon.verticesWorld[i], polygon.verticesWorld[(i + 1) % polygon.verticesWorld.length]);
      const distance = length(sub(circle, nearest.point));
      if (distance < bestDistance) {
        bestDistance = distance; boundary = nearest.point; face = i;
        feature = `edge-${i}-${nearest.t <= EPSILON ? 'start' : nearest.t >= 1 - EPSILON ? 'end' : 'face'}`;
      }
    }
    if (bestDistance > circle.radius + EPSILON) return [];
    normal = bestDistance > EPSILON ? mul(sub(circle, boundary), 1 / bestDistance) : polygon._normals[face];
    separation = bestDistance - circle.radius;
  }
  const circlePoint = sub(circle, mul(normal, circle.radius));
  return flip
    ? [contact(polygon, circle, boundary, circlePoint, mul(normal, -1), separation, feature)]
    : [contact(circle, polygon, circlePoint, boundary, normal, separation, feature)];
}

function project(vertices, axis) {
  let min = Infinity, max = -Infinity;
  for (const vertex of vertices) { const p = dot(vertex, axis); min = Math.min(min, p); max = Math.max(max, p); }
  return { min, max };
}

function bestFace(polygon, direction) {
  let index = 0, best = -Infinity;
  for (let i = 0; i < polygon._normals.length; i++) {
    const alignment = dot(polygon._normals[i], direction);
    if (alignment > best) { best = alignment; index = i; }
  }
  return index;
}

function clipSegment(points, axis, limit, keepGreater, label) {
  if (points.length < 2) return points;
  const signed = points.map(p => (dot(p.point, axis) - limit) * (keepGreater ? 1 : -1));
  const output = [];
  if (signed[0] >= -EPSILON) output.push(points[0]);
  if (signed[1] >= -EPSILON) output.push(points[1]);
  if (signed[0] * signed[1] < 0) {
    const fraction = signed[0] / (signed[0] - signed[1]);
    output.push({ point: add(points[0].point, mul(sub(points[1].point, points[0].point), fraction)), feature: label });
  }
  return output.slice(0, 2);
}

function polygons(a, b) {
  let overlap = Infinity, normal, owner = a;
  for (const polygon of [a, b]) {
    for (const axis of polygon._normals) {
      const pa = project(a.verticesWorld, axis), pb = project(b.verticesWorld, axis);
      if (pa.max < pb.min - EPSILON || pb.max < pa.min - EPSILON) return [];
      const positive = pb.max - pa.min, negative = pa.max - pb.min;
      const depth = Math.min(positive, negative);
      if (depth < overlap - EPSILON) {
        overlap = depth; normal = positive < negative ? axis : mul(axis, -1); owner = polygon;
      }
    }
  }
  const referenceIsA = owner === a;
  const reference = owner, incident = referenceIsA ? b : a;
  const desired = referenceIsA ? mul(normal, -1) : normal;
  const face = bestFace(reference, desired);
  const refNormal = reference._normals[face];
  const incFace = bestFace(incident, mul(refNormal, -1));
  const start = reference.verticesWorld[face], end = reference.verticesWorld[(face + 1) % reference.verticesWorld.length];
  const tangent = unit(sub(end, start));
  let points = [
    { point: incident.verticesWorld[incFace], feature: `v${incFace}` },
    { point: incident.verticesWorld[(incFace + 1) % incident.verticesWorld.length], feature: `v${(incFace + 1) % incident.verticesWorld.length}` }
  ];
  points = clipSegment(points, tangent, dot(start, tangent), true, 'clip-start');
  points = clipSegment(points, tangent, dot(end, tangent), false, 'clip-end');
  const contacts = [];
  for (const clipped of points) {
    const separation = dot(sub(clipped.point, start), refNormal);
    if (separation > EPSILON) continue;
    const projected = sub(clipped.point, mul(refNormal, separation));
    const feature = `${referenceIsA ? 'a' : 'b'}${face}-${incFace}-${clipped.feature}`;
    contacts.push(referenceIsA
      ? contact(a, b, projected, clipped.point, mul(refNormal, -1), separation, feature)
      : contact(a, b, clipped.point, projected, refNormal, separation, feature));
  }
  return contacts;
}

function collide(a, b) {
  const ba = a._bounds, bb = b._bounds;
  if (ba.maxX < bb.minX - EPSILON || bb.maxX < ba.minX - EPSILON || ba.maxY < bb.minY - EPSILON || bb.maxY < ba.minY - EPSILON) return [];
  if (a.kind === 'circle' && b.kind === 'circle') return circles(a, b);
  if (a.kind === 'circle') return circlePolygon(a, b);
  if (b.kind === 'circle') return circlePolygon(b, a, true);
  return polygons(a, b);
}

function prepare(contact, cache, inverseDt) {
  const { rootA: a, rootB: b, rA, rB, normal: n, tangent: t } = contact;
  const rnA = cross(rA, n), rnB = cross(rB, n), rtA = cross(rA, t), rtB = cross(rB, t);
  const normalDenominator = a.inverseMass + b.inverseMass + rnA * rnA * a.inverseInertia + rnB * rnB * b.inverseInertia;
  const tangentDenominator = a.inverseMass + b.inverseMass + rtA * rtA * a.inverseInertia + rtB * rtB * b.inverseInertia;
  contact.normalMass = normalDenominator > EPSILON ? 1 / normalDenominator : 0;
  contact.tangentMass = tangentDenominator > EPSILON ? 1 / tangentDenominator : 0;
  contact.bias = -inverseDt * Math.min(0, contact.separation + SLOP);
  const old = cache.get(contact.key);
  if (old && dot(old.normal, n) > 0.95) {
    contact.normalImpulse = old.normalImpulse;
    contact.tangentImpulse = old.tangentImpulse;
  }
  // ai.a(aj[],int,float): the original adds circle-only tangential drag.
  let circle = null, extra = 0;
  if ((a.kind === 'circle') !== (b.kind === 'circle')) {
    circle = a.kind === 'circle' ? a : b;
    extra = -contact.tangentMass * (circle.vx * t.x + circle.vy * t.y) * 0.2;
  }
  applyPair(contact, contact.normalImpulse, contact.tangentImpulse);
  if (circle) {
    circle.vx += extra * t.x * circle.inverseMass;
    circle.vy += extra * t.y * circle.inverseMass;
  }
}

function solve(contact) {
  const { rootA: a, rootB: b } = contact;
  let relative = sub(velocityAt(a, contact.rA, true), velocityAt(b, contact.rB, true));
  const oldBias = contact.biasImpulse;
  contact.biasImpulse = Math.max(0, oldBias + contact.normalMass * (contact.bias - dot(relative, contact.normal)));
  const deltaBias = contact.biasImpulse - oldBias;
  relative = sub(velocityAt(a, contact.rA), velocityAt(b, contact.rB));
  const oldNormal = contact.normalImpulse;
  contact.normalImpulse = Math.max(0, oldNormal - contact.normalMass * dot(relative, contact.normal));
  const deltaNormal = contact.normalImpulse - oldNormal;
  const converged = Math.abs(deltaNormal) < 0.003 && Math.abs(deltaBias) < 0.003;
  if (!converged) {
    applyPair(contact, deltaNormal);
    applyPair(contact, deltaBias, 0, true);
  }
  relative = sub(velocityAt(a, contact.rA), velocityAt(b, contact.rB));
  const oldTangent = contact.tangentImpulse;
  const frictionLimit = FRICTION * contact.normalImpulse;
  contact.tangentImpulse = clamp(oldTangent - contact.tangentMass * dot(relative, contact.tangent), -frictionLimit, frictionLimit);
  applyPair(contact, 0, contact.tangentImpulse - oldTangent);
  return converged;
}

function collisionEvents(contacts) {
  const events = new Map();
  for (const c of contacts) {
    const key = `${c.a._uid}:${c.b._uid}`;
    let event = events.get(key);
    if (!event) {
      event = { a: c.a, b: c.b, impulse: 0, relativeSpeed: c.relativeSpeed, relativeNormalSpeed: c.relativeNormalSpeed, normal: { ...c.normal }, point: { x: 0, y: 0 }, _count: 0 };
      events.set(key, event);
    }
    event.impulse += c.normalImpulse;
    event.relativeSpeed = Math.max(event.relativeSpeed, c.relativeSpeed);
    event.relativeNormalSpeed = Math.max(event.relativeNormalSpeed, c.relativeNormalSpeed);
    event.point.x += c.point.x; event.point.y += c.point.y; event._count++;
  }
  return [...events.values()].map(event => {
    event.point.x /= event._count; event.point.y /= event._count; delete event._count;
    return event;
  });
}

export class PhysicsWorld {
  constructor({ gravity = 200, iterations = 10 } = {}) {
    this.gravity = gravity;
    this.iterations = Math.max(1, Math.trunc(iterations));
    this.bodies = [];
    this._nextId = 1;
    this._contacts = new Map();
  }

  _primitive(spec) {
    const kind = spec.kind;
    if (!['box', 'circle', 'triangle', 'ground'].includes(kind)) throw new TypeError(`Unsupported physics shape: ${kind}`);
    const uid = this._nextId++;
    const body = {
      ...spec, id: spec.id ?? `body-${uid}`, _uid: uid, kind,
      x: value(spec.x), y: value(spec.y), angle: value(spec.angle),
      vx: value(spec.vx), vy: value(spec.vy), angularVelocity: value(spec.angularVelocity),
      canTranslate: spec.canTranslate !== false && kind !== 'ground',
      canRotate: spec.canRotate !== false && kind !== 'ground',
      _biasX: 0, _biasY: 0, _biasAngular: 0, parent: null
    };
    let automaticMass = 1, inertia = 0;
    if (kind === 'box') {
      body.width = Math.max(0.001, value(spec.width, 1)); body.height = Math.max(0.001, value(spec.height, 1));
      const x = body.width / 2, y = body.height / 2;
      body.vertices = [{ x: -x, y: -y }, { x, y: -y }, { x, y }, { x: -x, y }];
      automaticMass = body.width * body.height / 900;
      body.boundingRadius = Math.hypot(x, y);
    } else if (kind === 'triangle') {
      if (!Array.isArray(spec.vertices) || spec.vertices.length !== 3) throw new TypeError('A triangle requires three local-to-COM vertices');
      body.vertices = spec.vertices.map(p => ({ x: value(p.x ?? p[0]), y: value(p.y ?? p[1]) }));
      const area = Math.abs(polygonArea(body.vertices));
      if (area < EPSILON) throw new RangeError('A triangle must have nonzero area');
      automaticMass = area / 900;
      body._area = area;
      body.boundingRadius = Math.max(...body.vertices.map(length));
    } else if (kind === 'circle') {
      body.radius = Math.max(0.001, value(spec.radius, 1)); body.boundingRadius = body.radius;
    } else {
      body.boundingRadius = 0;
    }
    body.mass = value(spec.mass) > 0 ? spec.mass : automaticMass;
    if (kind === 'box') inertia = body.mass * (body.width * body.width + body.height * body.height) / 3;
    else if (kind === 'circle') inertia = body.mass * body.radius * body.radius / 2;
    else if (kind === 'triangle') inertia = 8 * body.mass * body._area / 12;
    body.inertia = inertia;
    body.inverseMass = body.canTranslate ? 1 / body.mass : 0;
    body.inverseInertia = body.canRotate && inertia > EPSILON ? 1 / inertia : 0;
    if (!body.canTranslate) { body.vx = 0; body.vy = 0; }
    if (!body.canRotate) body.angularVelocity = 0;
    if (body.vertices) body._winding = Math.sign(polygonArea(body.vertices));
    updatePrimitive(body);
    return body;
  }

  add(spec) {
    if (spec.kind !== 'compound') {
      const body = this._primitive(spec); this.bodies.push(body); return body;
    }
    if (!Array.isArray(spec.children) || !spec.children.length) throw new TypeError('A compound requires children');
    const body = this._compound(spec, spec.children.map(child => this._primitive(child)));
    this.bodies.push(body);
    return body;
  }

  _compound(spec, children, existingLinks = null) {
    const mass = children.reduce((sum, child) => sum + child.mass, 0);
    const x = children.reduce((sum, child) => sum + child.mass * child.x, 0) / mass;
    const y = children.reduce((sum, child) => sum + child.mass * child.y, 0) / mass;
    const uid = this._nextId++;
    const body = {
      ...spec, id: spec.id ?? `body-${uid}`, _uid: uid, kind: 'compound', children, mass,
      x, y, angle: value(spec.angle), vx: value(spec.vx), vy: value(spec.vy), angularVelocity: value(spec.angularVelocity),
      canTranslate: spec.canTranslate !== false, canRotate: spec.canRotate !== false,
      _biasX: 0, _biasY: 0, _biasAngular: 0, parent: null
    };
    body.inertia = 0; body.boundingRadius = 0;
    for (const child of children) {
      child.parent = body;
      child._offset = rotate(sub(child, body), -body.angle);
      child._localAngle = child.angle - body.angle;
      const extent = length(child._offset) + child.boundingRadius;
      // z.z() uses extent (not extent squared) in this historical formula.
      body.inertia += child.inertia + child.mass * extent;
      body.boundingRadius = Math.max(body.boundingRadius, extent);
    }
    body.inverseMass = body.canTranslate ? 1 / body.mass : 0;
    body.inverseInertia = body.canRotate && body.inertia > EPSILON ? 1 / body.inertia : 0;
    if (!body.canTranslate) { body.vx = 0; body.vy = 0; }
    if (!body.canRotate) body.angularVelocity = 0;
    updateBody(body);
    body._links = existingLinks ? new Set(existingLinks) : new Set();
    if (!existingLinks) {
      for (let i = 0; i < children.length; i++) {
        for (let j = i + 1; j < children.length; j++) {
          const contacts = collide(children[i], children[j]);
          // am.a(z): true overlap or a shared edge connects compound parts;
          // a single zero-depth corner contact does not create a joint.
          if (contacts.some(c => c.separation < -1e-5) || (contacts.length > 1 && length(sub(contacts[0].point, contacts[1].point)) > 1e-5)) {
            body._links.add(linkKey(children[i], children[j]));
          }
        }
      }
    }
    return body;
  }

  addGround(y = 0) { return this.add({ kind: 'ground', y, canTranslate: false, canRotate: false }); }

  remove(body) {
    if (body.removed) return;
    const root = rootOf(body);
    if (root !== body) {
      updateBody(root);
      const remaining = root.children.filter(child => child !== body);
      const unseen = new Set(remaining), components = [];
      while (unseen.size) {
        const first = unseen.values().next().value, component = [first];
        unseen.delete(first);
        for (let i = 0; i < component.length; i++) {
          for (const candidate of [...unseen]) {
            if (!root._links.has(linkKey(component[i], candidate))) continue;
            unseen.delete(candidate); component.push(candidate);
          }
        }
        components.push(component);
      }
      const replacements = components.map((component, index) => {
        let canTranslate = root.canTranslate, canRotate = root.canRotate;
        if (!canTranslate && !canRotate) {
          const grounded = this.bodies.some(ground => ground.kind === 'ground' && component.some(child => child._bounds.maxY >= ground.y - 1e-5));
          canTranslate = !grounded && component.some(child => child.canTranslate);
          canRotate = !grounded && component.some(child => child.canRotate);
        }
        if (component.length === 1) {
          const child = component[0];
          child.parent = null;
          child.canTranslate = canTranslate; child.canRotate = canRotate;
          child.inverseMass = canTranslate ? 1 / child.mass : 0;
          child.inverseInertia = canRotate && child.inertia > EPSILON ? 1 / child.inertia : 0;
          return child;
        }
        const section = this._compound({ ...root, id: `${root.id}-section-${index}`, canTranslate, canRotate }, component, root._links);
        const velocity = velocityAt(root, sub(section, root));
        section.vx = velocity.x; section.vy = velocity.y;
        section.angularVelocity = root.angularVelocity;
        updateBody(section);
        return section;
      });
      const index = this.bodies.indexOf(root);
      if (index >= 0) this.bodies.splice(index, 1, ...replacements);
      root.removed = true;
      root.children = remaining;
      body.parent = null;
    } else {
      this.bodies = this.bodies.filter(candidate => candidate !== body);
    }
    body.removed = true;
    this._contacts.clear();
  }

  applyImpulse(body, ix, iy, px = body.x, py = body.y) {
    const root = rootOf(body);
    impulse(root, value(ix), value(iy), { x: px - root.x, y: py - root.y });
    updateBody(root);
  }

  step(dt = 0.05, { activeBodies = null } = {}) {
    if (!Number.isFinite(dt) || dt <= 0) throw new RangeError('Physics timestep must be positive and finite');
    const active = activeBodies === null ? null : new Set([...activeBodies].map(rootOf));
    const isActive = body => active === null || active.has(body);
    const shapes = this.bodies.flatMap(body => body.kind === 'compound' ? body.children : body.kind === 'ground' ? [] : [body]);
    const grounds = this.bodies.filter(body => body.kind === 'ground');
    const contacts = [];
    for (const shape of shapes) {
      const root = rootOf(shape);
      if (isActive(root) && (root.inverseMass || root.inverseInertia)) {
        for (const ground of grounds) contacts.push(...groundContacts(shape, ground));
      }
    }
    for (let i = 0; i < shapes.length; i++) {
      for (let j = i + 1; j < shapes.length; j++) {
        const a = rootOf(shapes[i]), b = rootOf(shapes[j]);
        if (a === b || !(a.inverseMass || a.inverseInertia || b.inverseMass || b.inverseInertia)) continue;
        if (!isActive(a) && !isActive(b)) continue;
        contacts.push(...collide(shapes[i], shapes[j]));
      }
    }
    for (const body of this.bodies) {
      body._biasX = 0; body._biasY = 0; body._biasAngular = 0;
      if (isActive(body) && body.canTranslate) body.vy += this.gravity * dt;
    }
    // Original TYPE6 circles cause damage but never enter the impulse solver.
    const constraints = contacts.filter(c => !c.a.sensor && !c.b.sensor);
    for (const c of constraints) prepare(c, this._contacts, 1 / dt);
    for (let iteration = 0; iteration < this.iterations; iteration++) {
      let allConverged = true;
      for (const c of constraints) if (!solve(c)) allConverged = false;
      if (allConverged) break;
    }
    for (const body of this.bodies) {
      if (isActive(body) && body.canRotate) body.angle = f32(body.angle + (body.angularVelocity + body._biasAngular) * dt);
      if (isActive(body) && body.canTranslate) {
        body.x = f32(body.x + (body.vx + body._biasX) * dt);
        body.y = f32(body.y + (body.vy + body._biasY) * dt);
      }
      body.vx = f32(body.vx); body.vy = f32(body.vy); body.angularVelocity = f32(body.angularVelocity);
      updateBody(body);
    }
    this._contacts = new Map(constraints.map(c => [c.key, { normal: c.normal, normalImpulse: c.normalImpulse, tangentImpulse: c.tangentImpulse }]));
    return collisionEvents(contacts);
  }
}
