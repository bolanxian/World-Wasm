
import { Ndarray } from "./ndarray";
import { createWorld } from "./world";

self.addEventListener('message', async (e) => {
  try {
    const { data } = e
    const functionToRun = Function(`'use strict';return (${data.functionToRun})`)()
    const world = await createWorld(data.module)
    let [result, transfer] = await functionToRun({ Ndarray, world }, data.args)
    postMessage(result, transfer)
  } catch (error) {
    if (typeof error === 'string') {
      postMessage({ error })
    } else {
      postMessage({ error: error?.message ?? 'error' })
    }
  }
}, { once: !0 })
