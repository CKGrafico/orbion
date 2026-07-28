/* A rendered preview of the infrastructure chat's approval moment,
   using the app's real decision set. Static by design: the point is
   the shape of the interaction, not motion. */
export function ChatVignette() {
  return (
    <div className="mx-auto w-full max-w-2xl rounded-[20px] border border-line-subtle bg-panel/70 p-1.5">
      <div className="rounded-[15px] border border-line bg-sidebar">
        <div className="flex items-center gap-2.5 border-b border-line-subtle px-5 py-3">
          <span className="h-2 w-2 rounded-full bg-infra" />
          <span className="font-mono text-xs text-text">Infrastructure</span>
          <span className="font-mono text-[10px] text-text-muted">main VM · vm-berlin</span>
        </div>

        <div className="flex flex-col gap-4 px-5 py-5">
          <div className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-active px-4 py-2.5 text-sm text-text">
            Clone the orbion repo on build-box and start the daemon
          </div>

          <div className="max-w-[92%] rounded-2xl rounded-bl-md border-l-2 border-infra bg-elevated px-4 py-3 text-sm text-text-sec">
            build-box is reachable over SSH. I need to run two commands there:
            <div className="mt-2 rounded-lg bg-log px-3 py-2 font-mono text-xs leading-relaxed text-text-sec">
              git clone https://github.com/PlainConceptsPlatform/orbion
              <br />
              loop-task start
            </div>
          </div>

          <div className="rounded-xl border border-line bg-input px-4 py-3.5">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-warm">
              Approval required
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-ink">
                Approve once
              </span>
              <span className="rounded-full border border-line px-3.5 py-1.5 text-xs text-text-sec">
                Always allow this session
              </span>
              <span className="rounded-full border border-line px-3.5 py-1.5 text-xs text-text-sec">
                Decline
              </span>
              <span className="rounded-full border border-line px-3.5 py-1.5 text-xs text-danger">
                Cancel turn
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
