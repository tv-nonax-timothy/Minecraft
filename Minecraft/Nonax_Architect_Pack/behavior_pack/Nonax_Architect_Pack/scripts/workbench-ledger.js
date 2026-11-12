function requireId(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} is required`);
}

function requirePosition(position) {
  if (!position || typeof position.dimension !== "string" || !position.dimension ||
      !Number.isInteger(position.x) || !Number.isInteger(position.y) || !Number.isInteger(position.z)) {
    throw new Error("invalid workbench position");
  }
}

function requireCount(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("invalid build count");
}

function validate(record) {
  if (!record || record.version !== 1) throw new Error("invalid ledger version");
  requireId(record.id, "workbench id");
  requireCount(record.buildCount);
  if (!["placed", "recovering", "carried", "revoked"].includes(record.state)) {
    throw new Error("invalid workbench state");
  }
  if (!Array.isArray(record.retiredArchitectIds) ||
      record.retiredArchitectIds.some((id) => typeof id !== "string" || !id) ||
      new Set(record.retiredArchitectIds).size !== record.retiredArchitectIds.length) {
    throw new Error("invalid retired architect ids");
  }
  for (const field of ["carpenterIds", "retiredCarpenterIds"]) {
    const ids = record[field];
    if (ids !== undefined && (!Array.isArray(ids) ||
        ids.some((id) => typeof id !== "string" || !id) || new Set(ids).size !== ids.length)) {
      throw new Error(`invalid ${field}`);
    }
  }
  const activeCarpenters = record.carpenterIds ?? [];
  const retiredCarpenters = record.retiredCarpenterIds ?? [];
  if (activeCarpenters.length > 4 ||
      activeCarpenters.some((id) => retiredCarpenters.includes(id)) ||
      (activeCarpenters.length > 0 && (record.state !== "placed" || !record.architectId))) {
    throw new Error("invalid active carpenters");
  }
  if (record.initialCarpenter !== undefined && typeof record.initialCarpenter !== "boolean") {
    throw new Error("invalid initial carpenter flag");
  }
  if (record.followSlot !== undefined &&
      (!Number.isInteger(record.followSlot) || record.followSlot < 1 || record.followSlot > 20 ||
       record.state !== "placed" || !record.architectId)) {
    throw new Error("invalid follow slot");
  }
  if (record.architectId !== undefined) {
    requireId(record.architectId, "architect id");
    if (record.state !== "placed" || record.retiredArchitectIds.includes(record.architectId)) {
      throw new Error("invalid active architect");
    }
  }
  if (record.state === "placed" || record.state === "recovering") {
    requirePosition(record.position);
  } else if (record.position !== undefined) {
    throw new Error("unexpected workbench position");
  }
  return record;
}

export function validateWorkbenchRecord(record) {
  return validate(record);
}

function copy(record, changes) {
  return validate({ ...record, retiredArchitectIds: [...record.retiredArchitectIds], ...changes });
}

export function createWorkbenchRecord(id, position) {
  requireId(id, "workbench id");
  requirePosition(position);
  return validate({
    version: 1, id, state: "placed", position: { ...position },
    buildCount: 0, architectId: undefined, retiredArchitectIds: [],
    carpenterIds: [], retiredCarpenterIds: [], initialCarpenter: true
  });
}

export function bindArchitect(record, architectId) {
  validate(record);
  requireId(architectId, "architect id");
  if (record.state !== "placed" || record.architectId !== undefined ||
      record.retiredArchitectIds.includes(architectId)) {
    throw new Error("workbench cannot bind architect");
  }
  return copy(record, { architectId });
}

export function recordBuildCount(record, architectId, count) {
  validate(record);
  requireCount(count);
  if (record.state !== "placed" || record.architectId !== architectId ||
      !architectId || count !== record.buildCount + 1) {
    throw new Error("invalid build count update");
  }
  return copy(record, { buildCount: count });
}

export function bindCarpenter(record, carpenterId, limit) {
  validate(record);
  requireId(carpenterId, "carpenter id");
  const active = record.carpenterIds ?? [];
  if (record.state !== "placed" || !record.architectId || !Number.isInteger(limit) ||
      limit < 1 || limit > 4 || active.length >= limit ||
      active.includes(carpenterId) || (record.retiredCarpenterIds ?? []).includes(carpenterId)) {
    throw new Error("workbench cannot bind carpenter");
  }
  return copy(record, { carpenterIds: [...active, carpenterId], initialCarpenter: false });
}

export function carpenterDied(record, carpenterId) {
  validate(record);
  const active = record.carpenterIds ?? [];
  if (!active.includes(carpenterId)) throw new Error("carpenter is not active");
  return copy(record, { carpenterIds: active.filter((id) => id !== carpenterId) });
}

export function beginRecovery(record) {
  validate(record);
  if (record.state !== "placed") throw new Error("workbench is not placed");
  const retired = [...record.retiredArchitectIds];
  if (record.architectId) retired.push(record.architectId);
  return copy(record, {
    state: "recovering", architectId: undefined, retiredArchitectIds: retired,
    retiredCarpenterIds: [...(record.retiredCarpenterIds ?? []), ...(record.carpenterIds ?? [])],
    carpenterIds: [], initialCarpenter: false, followSlot: undefined
  });
}

export function finishRecovery(record, creative) {
  validate(record);
  if (record.state !== "recovering" || typeof creative !== "boolean") {
    throw new Error("workbench is not recovering");
  }
  return copy(record, { state: creative ? "revoked" : "carried", position: undefined });
}

export function placeRecoveredWorkbench(record, position) {
  validate(record);
  requirePosition(position);
  if (record.state !== "carried") throw new Error("workbench item is not available");
  return copy(record, { state: "placed", position: { ...position } });
}

export function forgetRetiredArchitect(record, architectId) {
  validate(record);
  requireId(architectId, "architect id");
  if (!record.retiredArchitectIds.includes(architectId)) throw new Error("architect is not retired");
  return copy(record, {
    retiredArchitectIds: record.retiredArchitectIds.filter((id) => id !== architectId)
  });
}
