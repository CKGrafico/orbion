# Tasks

- [ ] 1.1 Add `checkLocalPort()` function to `src/main/ssh-tunnel.ts` <!-- agent: fullstack-engineer.build, depends_on: [], touches: [src/main/ssh-tunnel.ts] -->
- [ ] 1.2 Integrate port verification into `openTunnel()` timeout handler <!-- agent: fullstack-engineer.build, depends_on: [1.1], touches: [src/main/ssh-tunnel.ts] -->
- [ ] 2.1 Add port verification tests in `tests/ssh-tunnel-port-verify.test.ts` <!-- agent: fullstack-engineer.build, depends_on: [1.1], touches: [tests/ssh-tunnel-port-verify.test.ts] -->
- [ ] 3.1 Run typecheck and fix errors <!-- agent: fullstack-engineer.fast, depends_on: [1.2, 2.1], touches: [] -->
