import React, {lazy} from 'react'

import {constants} from '@batman/constants'
import {Logger} from '@batman/core-logger'
import axios from 'axios'
import {Parser, ProcessNodeDefinitions} from 'html-to-react'
import stringify from 'json-stringify-deterministic'

import {Module, RemotesContext} from './types'

/**
 * Consumer of /prerender endpoint generated by libs/framework/middlewares/prerender.
 * prerendered HTML is converted into a React element and client-side remote-entry.js
 * module federation files are inlined for client-side render and hydration
 *
 * @param ctx - global caching object
 * @param remote - caching key
 * @param module - module to fetch from remote
 * @param props - props passed to component to be rendered
 * @param remoteUrl - host url of prerender endpoint
 * @returns React component with required <script> and <style> tags to load on client-side
 */

export const getServerComponent = (
  ctx: RemotesContext,
  remote: string,
  module: string,
  props: {[key: string]: any},
  remoteUrl: string,
) => {
  // We cache based on properties. This allows us to only
  // do one fetch for multiple references of a remote component.
  const id = stringify({remote, module, props})

  let Component = ctx[id] as Module

  // if (Component) {
  //   // component is already in the cache, use that
  //   return Component
  // }

  const cacheManagerUrl = `${remoteUrl.split(':')[0]}:${remoteUrl.split(':')[1]}:9000/${remoteUrl.split(':')[2]}`

  Component = lazy(async () => {
    // Do the post request to pre-render the federated component
    try {
      const res = await axios(`${cacheManagerUrl}/prerender`, {
        method: 'POST',
        data: {
          module,
          props,
        },
        headers: {
          'content-type': 'application/json',
        },
      })
      let parsedChunks: Array<any>
      const [chunks, html, state] = res.data.split(constants.SERIALISED_RESPONSE_SEPARATOR)

      Logger.info(res.data)

      try {
        parsedChunks = JSON.parse(chunks)
      } catch (err: any) {
        parsedChunks = []
        Logger.error(err)
      }

      const processNodeDefinitions = new ProcessNodeDefinitions(React)
      const parser = new Parser()

      // eslint-disable-next-line @typescript-eslint/naming-convention
      const __INTERNAL_NODE_TAG = 'this-is-a-suspended-element'

      return {
        default: ({children}: any) => {
          const parseInstructions = [
            {
              shouldProcessNode: (node: any) => {
                // If the pre-rendered component rendered a children placeholder,
                // we will process this ourselves.
                if (node?.type === 'text' && node.data === '\u200Cchildren\u200C') {
                  return true
                }
                return false
              },
              processNode: (_: any, __: any, index: number) => {
                // Instead of retaining the children placeholder, render out
                // the children components. This even allows for recursive
                // federated components!
                return <React.Fragment key={index}>{children}</React.Fragment>
              },
            },
            {
              shouldProcessNode: (node: any) => {
                return node?.type === 'tag' && node?.name === __INTERNAL_NODE_TAG
              },
              processNode: (node: any, kids: any) => {
                return <React.Suspense fallback={React.Fragment}>{kids}</React.Suspense>
              },
            },
            {
              // Process all other nodes with the lib defaults.
              shouldProcessNode: () => true,
              processNode: processNodeDefinitions.processDefaultNode,
            },
          ]

          const processSuspenseComments = (htmlString: string) => {
            return htmlString
              .replaceAll(/<!--\$[!]*-->/g, `<${__INTERNAL_NODE_TAG}>`)
              .replaceAll(/<!--\/\$[!]*-->/g, `</${__INTERNAL_NODE_TAG}>`)
          }

          // Turn the pre-rendered HTML string into a react element
          // while rendering out the children.
          const reactElement = parser.parseWithInstructions(
            processSuspenseComments(html),
            () => true,
            parseInstructions,
          )

          return (
            <>
              {/* Add style chunks and async script tags for the script chunks. */}
              {parsedChunks.map(chunk =>
                chunk.endsWith('.css') ? (
                  <link key={chunk} rel="stylesheet" href={chunk} />
                ) : (
                  <script key={chunk} defer src={chunk} />
                ),
              )}
              {/* output the initial state from each MFE module  */}
              {state === 'NO STATE' ? null : (
                <div className="hidden-state" style={{display: 'none'}} data-state={module}>
                  {state}
                </div>
              )}
              {/* Render the re-constructed react element */}
              {reactElement}
            </>
          )
        },
      }
    } catch (err: any) {
      // console.log(err)
      Logger.error(err.message)
      throw new Error(err.message)
    }
  })
  ctx[id] = Component

  return Component
}
