import { env } from '../config/env';

export class IngestionQueue {
  private queue: Array<() => void> = [];
  private processing = false;
  private droppedCount = 0;
  private readonly maxSize: number;

  constructor(maxSize = env.INGESTION_QUEUE_MAX_SIZE) {
    this.maxSize = maxSize;
  }

  enqueue(task: () => void): void {
    if (this.queue.length >= this.maxSize) {
      this.queue.shift();
      this.droppedCount++;
      if (this.droppedCount % 100 === 0) {
        console.warn(`[IngestionQueue] ${this.droppedCount} mensajes descartados.`);
      }
    }
    this.queue.push(task);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.processing) return;
    this.processing = true;
    setImmediate(() => this.flush());
  }

  private flush(): void {
    const task = this.queue.shift();
    if (task) {
      try {
        task();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[IngestionQueue] Error en tarea:', message);
      }
    }
    if (this.queue.length > 0) {
      setImmediate(() => this.flush());
    } else {
      this.processing = false;
    }
  }

  get size(): number {
    return this.queue.length;
  }

  get dropped(): number {
    return this.droppedCount;
  }
}
