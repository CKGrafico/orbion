# gh-201-live-log-reconnect

Fix live log following not reconnecting after SSE termination. The LogViewer component
now shows a StreamStateIndicator with reconnecting/stopped states. This is a visible
interaction change — the viewer reconnects automatically and shows the connection state.
