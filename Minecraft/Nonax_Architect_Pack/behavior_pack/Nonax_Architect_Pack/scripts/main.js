import { world, system, BlockPermutation } from "@minecraft/server";
import { BLUEPRINTS, validateBlueprint } from "./blueprints.js";

const LOG = "[nonax:architect]";
const PLACE_INTERVAL_TICKS = 5;
const FACE_OFFSETS = {
  North: { x: 0, y: 0, z: -1 },
  East: { x: 1, y: 0, z: 0 },
  South: { x: 0, y: 0, z: 1 },
  West: { x: -1, y: 0, z: 0 },
  Up: { x: 0, y: 1, z: 0 },
  Down: { x: 0, y: -1, z: 0 }
};

// プレイヤーIDごとの進行中ジョブ
const jobs = new Map();
let timerId = undefined;

function notify(player, message) {
  try {
    player.sendMessage(message);
  } catch (e) {
    console.warn(`${LOG} sendMessage failed: ${e}`);
  }
}

function startJob(player, blueprintId, origin) {
  const bp = BLUEPRINTS[blueprintId];
  const dataError = validateBlueprint(bp);
  if (dataError) {
    console.warn(`${LOG} blueprint invalid (${blueprintId}): ${dataError}`);
    notify(player, `§c設計図が不正です: ${dataError}`);
    return;
  }
  if (jobs.has(player.id)) {
    notify(player, "§e建築中です。完了までお待ちください。");
    return;
  }

  const dimension = player.dimension;
  const queue = [];
  for (const b of bp.blocks) {
    const pos = { x: origin.x + b.x, y: origin.y + b.y, z: origin.z + b.z };
    const target = dimension.getBlock(pos);
    if (!target) {
      notify(player, "§c建築範囲が読み込まれていません。");
      return;
    }
    if (!target.isAir) {
      notify(player, `§c建築範囲に既存のブロックがあります (${pos.x}, ${pos.y}, ${pos.z})。`);
      return;
    }
    queue.push({ pos, id: b.id });
  }

  const job = { player, dimension, queue, index: 0, nextTick: 0, blueprintId };
  jobs.set(player.id, job);
  console.warn(`${LOG} job start: ${blueprintId} blocks=${queue.length} player=${player.name}`);
  notify(player, `§a${bp.name}を使用しました。建築を開始します。`);
  ensureTimer();
}

function finishJob(job, ok, reason) {
  jobs.delete(job.player.id);
  console.warn(`${LOG} job end: ok=${ok} placed=${job.index}/${job.queue.length}${reason ? ` reason=${reason}` : ""}`);
  if (ok) {
    notify(job.player, "§a建築が完了しました。");
  } else {
    notify(job.player, `§c建築を中断しました: ${reason}`);
  }
  if (jobs.size === 0 && timerId !== undefined) {
    system.clearRun(timerId);
    timerId = undefined;
  }
}

function tickJobs() {
  for (const job of [...jobs.values()]) {
    try {
      if (!job.player.isValid) {
        finishJob(job, false, "プレイヤーが退出しました");
        continue;
      }
      if (system.currentTick < job.nextTick) continue;
      job.nextTick = system.currentTick + PLACE_INTERVAL_TICKS;

      const step = job.queue[job.index];
      const block = job.dimension.getBlock(step.pos);
      if (!block) {
        finishJob(job, false, "建築範囲が読み込まれていません");
        continue;
      }
      if (!block.isAir) {
        finishJob(job, false, "設置先に別のブロックが置かれました");
        continue;
      }
      block.setPermutation(BlockPermutation.resolve(step.id));
      job.index++;
      if (job.index >= job.queue.length) finishJob(job, true);
    } catch (e) {
      finishJob(job, false, "エラーが発生しました");
      console.warn(`${LOG} tick error: ${e}`);
    }
  }
}

function ensureTimer() {
  if (timerId === undefined) timerId = system.runInterval(tickJobs, 1);
}

try {
  world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
    const { player, block, itemStack, blockFace } = event;
    if (!player || !block || !itemStack) return;
    if (!BLUEPRINTS[itemStack.typeId]) return;
    if (event.isFirstEvent === false) return;

    // 設計図は通常の操作を行わせない
    event.cancel = true;

    const offset = FACE_OFFSETS[blockFace] ?? FACE_OFFSETS.Up;
    const origin = {
      x: block.location.x + offset.x,
      y: block.location.y + offset.y,
      z: block.location.z + offset.z
    };
    const blueprintId = itemStack.typeId;
    system.run(() => {
      try {
        startJob(player, blueprintId, origin);
      } catch (e) {
        console.warn(`${LOG} startJob error: ${e}`);
        notify(player, "§c建築を開始できませんでした。");
      }
    });
  });
  console.warn(`${LOG} script loaded`);
} catch (e) {
  console.warn(`${LOG} init failed: ${e}`);
}
