import { Router } from 'express'
import { pickApplicationPath } from '../lib/filePicker.js'

const router = Router()

router.post('/pick-path', async (req, res) => {
  const result = await pickApplicationPath()
  res.json(result)
})

export default router
