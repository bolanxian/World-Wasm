
import { Ndarray } from './ndarray'
import { createWorldInner } from './world'

self.addEventListener('message', async (e) => {
  try {
    const { data } = e
    const functionToRun = Function(`'use strict';return (${data.functionToRun})`)()
    const world = await createWorldInner(data.module)
    let [result, transfer] = await functionToRun({ Ndarray, world }, data.args)
    postMessage(result, transfer)
  } catch (error) {
    try {
      postMessage({ error: error ?? 'Unknown Error' })
      return
    } catch (e1) { }
    try {
      let { name, message, stack } = error
      message ??= 'Unknown Error'
      postMessage({ error: { name, message, stack } })
      return
    } catch (e2) { }
    postMessage({ error: { message: 'Unknown Error' } })
  }
}, { once: !0 })
