/** An export must finish against the source it loaded, even while another
 * workspace task edits the running development server. Keep HMR off this tab. */
export async function freezeAssetUpdates(page) {
  await page.routeWebSocket(/\/_next\/webpack-hmr/, socket => {
    const server = socket.connectToServer()
    server.onMessage(message => {
      if (typeof message === "string") {
        const event = JSON.parse(message)
        if (["reloadPage", "serverComponentChanges", "turbopack-message", "built", "sync"].includes(event.type ?? event.action)) return
      }
      socket.send(message)
    })
  })
}
