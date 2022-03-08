import React, {lazy} from 'react'

// eslint-disable-next-line import/no-extraneous-dependencies
import constants from '@next/constants'
import axios from 'axios'
import {Parser, ProcessNodeDefinitions} from 'html-to-react'
import stringify from 'json-stringify-deterministic'

import {Module, RemotesContext} from './types'

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

  if (!Component) {
    Component = lazy(() =>
      // Do the post request to pre-render the federated component
      axios(`${remoteUrl}/prerender`, {
        method: 'POST',
        data: {
          module,
          props,
        },
        headers: {
          'content-type': 'application/json',
        },
      }).then((res: any) => {
        const [chunks, html] = res.data.split(constants.SERIALISED_RESPONSE_SEPARATOR)
        const parsedChunks: Array<any> = JSON.parse(chunks)

        const processNodeDefinitions = new ProcessNodeDefinitions(React)
        const parser = new Parser()

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
                // Process all other nodes with the lib defaults.
                shouldProcessNode: () => true,
                processNode: processNodeDefinitions.processDefaultNode,
              },
            ]

            // Turn the pre-rendered HTML string into a react element
            // while rendering out the children.
            const reactElement = parser.parseWithInstructions(html, () => true, parseInstructions)

            return (
              <>
                {/* Add style chunks and async script tags for the script chunks. */}
                {parsedChunks.map(chunk =>
                  chunk.endsWith('.css') ? (
                    <link key={chunk} rel="stylesheet" href={chunk} />
                  ) : (
                    <script key={chunk} async src={chunk} />
                  ),
                )}
                {/* Render the re-constructed react element */}
                {reactElement}
              </>
            )
          },
        }
      }),
    )
    ctx[id] = Component
  }

  return Component
}
