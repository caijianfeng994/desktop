/**
 * Plan equip/unequip toggles for first-light starter loadout.
 * Never buys parts — missing owned ids are reported instead.
 *
 * Power model (matches engine): basePower + Σ partPower; capacity 12 without battery.
 */
export function planStarterLoadout({owned, equipped, capacity, basePower, partPower}) {
  const ownedSet = new Set(owned);
  const equippedNow = [...equipped];
  const powerOf = (id) => Number(partPower[id] || 0);
  const sumPower = (ids) => basePower + [...ids].reduce((s, id) => s + powerOf(id), 0);

  const missing = [];
  let chassis = null;
  if (equippedNow.includes('tracks') && ownedSet.has('tracks')) chassis = 'tracks';
  else if (equippedNow.includes('wheels') && ownedSet.has('wheels')) chassis = 'wheels';
  else if (ownedSet.has('wheels')) chassis = 'wheels';
  else if (ownedSet.has('tracks')) chassis = 'tracks';
  else missing.push('wheels');

  if (!ownedSet.has('camera')) missing.push('camera');

  let arm = null;
  if (equippedNow.includes('arm') && ownedSet.has('arm')) arm = 'arm';
  else if (equippedNow.includes('arm_left') && ownedSet.has('arm_left')) arm = 'arm_left';
  else if (ownedSet.has('arm')) arm = 'arm';
  else if (ownedSet.has('arm_left')) arm = 'arm_left';
  else missing.push('arm');

  if (missing.length) {
    const labels = {wheels: '轮式底盘', camera: '摄像头', arm: '机械臂'};
    const names = missing.map((id) => labels[id] || id).join('、');
    return {
      equip: [],
      unequip: [],
      missing,
      note: `请先解锁${names}`,
      finalPower: sumPower(equippedNow),
      finalCapacity: capacity,
      target: [...equippedNow],
      ok: false,
    };
  }

  // Required starter set + keep battery / other extras already on.
  const target = new Set([chassis, 'camera', arm]);
  for (const id of equippedNow) {
    if (id === 'wheels' || id === 'tracks' || id === 'arm' || id === 'arm_left' || id === 'camera' || id === 'display') continue;
    target.add(id);
  }

  const finalCapacity = target.has('battery') ? Math.max(capacity, 18) : capacity;

  // Prefer keep display if currently equipped and budget allows.
  if (equippedNow.includes('display')) {
    const withDisplay = [...target, 'display'];
    if (sumPower(withDisplay) <= finalCapacity) target.add('display');
  }

  // Keep a second arm only when already equipped and budget allows.
  const otherArm = arm === 'arm' ? 'arm_left' : 'arm';
  if (equippedNow.includes(otherArm)) {
    const withBoth = [...target, otherArm];
    if (sumPower(withBoth) <= finalCapacity) target.add(otherArm);
  }

  // Tracks + camera + arm can exceed 12W even without display — prefer wheels.
  if (sumPower(target) > finalCapacity && target.has('tracks') && ownedSet.has('wheels')) {
    target.delete('tracks');
    target.add('wheels');
    chassis = 'wheels';
    if (equippedNow.includes('display') && !target.has('display')) {
      const withDisplay = [...target, 'display'];
      if (sumPower(withDisplay) <= finalCapacity) target.add('display');
    }
  }

  const finalPower = sumPower(target);
  if (finalPower > finalCapacity) {
    return {
      equip: [],
      unequip: [],
      missing: [],
      note: '供电超出预算，请先安装扩容电池或调整装配。',
      finalPower,
      finalCapacity,
      target: [...equippedNow],
      ok: false,
    };
  }

  const targetList = [...target];
  const equip = targetList.filter((id) => !equippedNow.includes(id));
  const unequip = equippedNow.filter((id) => !target.has(id));

  let note = '将安装首关所需零件，不自动购买。';
  if (!equip.length && !unequip.length) {
    note = '当前装配已满足首关推荐。';
  } else if (unequip.includes('tracks') && equip.includes('wheels')) {
    note = unequip.includes('display')
      ? '履带功耗偏高，改推轮式底盘，并卸下表情屏幕以装上摄像头与机械臂。'
      : '履带功耗偏高，改推轮式底盘以装上摄像头与机械臂。';
  } else if (unequip.includes('display')) {
    note = '为装上摄像头与机械臂，需临时卸下表情屏幕（供电预算内）。';
  }

  return {
    equip,
    unequip,
    missing: [],
    note,
    finalPower,
    finalCapacity,
    target: targetList,
    ok: true,
  };
}

/** Mission-scoped wrapper; starter plan only for first-light. */
export function recommendedLoadoutFor(missionId, state) {
  if (missionId !== 'first-light') {
    return {
      equip: [],
      unequip: [],
      missing: [],
      note: '暂无该委托的推荐装配',
      finalPower: 0,
      finalCapacity: 0,
      target: [],
      ok: false,
    };
  }
  const partPower = Object.fromEntries((state.parts || []).map((p) => [p.id, p.power]));
  return planStarterLoadout({
    owned: state.owned,
    equipped: state.equipped,
    capacity: state.capacity,
    basePower: 2,
    partPower,
  });
}
