import * as dotenv from 'dotenv'
import express from 'express'

import {AzureTableStorage, cacheExpired, getComponent, insertNewItem} from './utils'

dotenv.config()

const app = express()
app.use(express.json())

app.post('/:port/prerender', async (req, res) => {
  try {
    let component

    const connectionString = process.env.CONNECTION_STRING || ''
    const tableName = process.env.TABLE_NAME || ''

    const remoteName = req.get('remote-name') || ''

    const languageHeader = req.headers['content-language'] || 'en-GB'
    const headers = {
      'Content-Language': languageHeader,
      'remote-name': remoteName,
    }

    try {
      const client = await AzureTableStorage.connectTableClient(connectionString, tableName)

      const rowKey = {...req.body, language: languageHeader}

      const base64Body = Buffer.from(JSON.stringify(rowKey)).toString('base64')

      const tableRes: any = await AzureTableStorage.getTableItem(client, remoteName, base64Body)

      if (tableRes === undefined) {
        const response = await getComponent(req.body, req.params.port)
        component = response.data
        insertNewItem(remoteName, base64Body, response.data, client)
      } else if (cacheExpired(tableRes.expiryDate)) {
        await AzureTableStorage.deleteTableItem(client, tableRes.partitionKey, tableRes.rowKey)
        const response = await getComponent(req.body, req.params.port)
        insertNewItem(remoteName, base64Body, response.data, client)
        component = response.data
      } else {
        component = tableRes.value
      }
    } catch (err) {
      const response = await getComponent(req.body, req.params.port)
      component = response.data
    }

    res.set(headers)
    res.status(200).send(component)
  } catch (err) {
    res.sendStatus(500)
  }
})

export default app
