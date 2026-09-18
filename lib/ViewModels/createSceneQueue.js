// Aplicar escenas en serie; durante una carga solo se conserva la última pendiente.
export default function createSceneQueue(apply, complete) {
  let running = false;
  let pending;
  async function drain() {
    running = true;
    while (pending) {
      const event = pending;
      pending = undefined;
      try {
        await apply(event);
        complete(event, true);
      } catch (error) {
        complete(event, false, error);
      }
    }
    running = false;
  }
  return function enqueue(event) {
    if (pending) complete(pending, false, undefined, true);
    pending = event;
    if (!running) void drain();
  };
}
