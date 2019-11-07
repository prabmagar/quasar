/**
 * THIS FILE WILL BE OVERWRITTEN.
 * DO NOT EDIT.
 *
 * You are probably looking into adding hooks in your code. This should be done by means of
 * src-bex/activatedBackgroundHooks (which have access to the browser instance and communication bridge) or
 * src-bex/globalBackgroundHooks (which have access to the browser instance)
 **/

/* global chrome */

import attachActivatedBackgroundHooks from '../../../src-bex/js/activated-background-hooks'
import attachGlobalBackgroundHooks from '../../../src-bex/js/global-background-hooks'
import Bridge from '../bridge'

const connections = {}

attachGlobalBackgroundHooks(chrome)

/**
 * Create a link between App and ContentScript connections
 * The link will be mapped on a messaging level
 * @param port
 */
const addConnection = (port) => {
  const tab = port.sender.tab

  let connectionId
  if (port.name.indexOf(':') > -1) {
    const split = port.name.split(':')
    connectionId = split[1]
    port.name = split[0]
  } else {
    connectionId = tab.id
  }

  let currentConnection = connections[connectionId]
  if (!currentConnection) {
    currentConnection = connections[connectionId] = {}
  }

  currentConnection[port.name] = {
    port,
    connected: true,
    listening: false
  }

  return currentConnection[port.name]
}

chrome.runtime.onConnect.addListener(port => {
  // Add this port to our pool of connections
  const thisConnection = addConnection(port)
  thisConnection.port.onDisconnect.addListener(() => {
    thisConnection.connected = false
  })

  /**
   * Create a comms layer between the background script and the App / ContentScript
   * Note: This hooks into all connections as the background script should be able to send
   * messages to all apps / content scripts within it's realm (the BEX)
   * @type {Bridge}
   */
  const bridge = new Bridge({
    listen (fn) {
      for(let connectionId in connections) {
        const connection = connections[connectionId]
        if (connection.app && !connection.app.listening) {
          connection.app.listening = true
          connection.app.port.onMessage.addListener(fn)
        }

        if (connection.contentScript && !connection.contentScript.listening) {
          connection.contentScript.port.onMessage.addListener(fn)
          connection.contentScript.listening = true
        }
      }
    },
    send (data) {
      for(let connectionId in connections) {
        const connection = connections[connectionId]
        connection.app && connection.app.connected && connection.app.port.postMessage(data)
        connection.contentScript && connection.contentScript.connected && connection.contentScript.port.postMessage(data)
      }
    }
  })

  attachActivatedBackgroundHooks(chrome, bridge)

  // Map a messaging layer between the App and ContentScript
  for (let connectionId of Object.keys(connections)) {
    const connection = connections[connectionId]
    if (connection.app && connection.contentScript) {
      mapConnections(connection.app, connection.contentScript)
    }
  }
})

function mapConnections (app, contentScript) {
  // Send message from content script to app
  app.port.onMessage.addListener((message) => {
    if (contentScript.connected) {
      contentScript.port.postMessage(message)
    }
  })

  // Send message from app to content script
  contentScript.port.onMessage.addListener((message) => {
    if (app.connected) {
      app.port.postMessage(message)
    }
  })
}
