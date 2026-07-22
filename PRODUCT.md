# Product Context

register: brand

## Purpose

cWBTC Faucet is a public CKB testnet faucet for the Fiber Cross-Chain Hub demo. It gives developers test cWBTC, a regular CKB UDT used as fake wrapped BTC, so they can try the CKB UDT to Fiber CCH to Lightning testnet payment flow.

## Audience

Developers, DevRel, ecosystem partners, and infrastructure operators testing Fiber CCH. They need a credible public entry point that explains what the test asset is and lets them claim it without reading an operations document.

## Voice

Clear, technical, restrained, and trustworthy. Avoid crypto hype, faux urgency, AI-looking gradients, and decorative dashboard fluff.

## Product Principles

- The claim flow is the primary action.
- The homepage should stay focused on requesting test cWBTC. Fiber CCH context and setup belong in the linked developer guide.
- cWBTC must be described as a test UDT with no mainnet value.
- Operational trust matters: show claim amount, balance, cooldown behavior, and transaction status plainly.
- Developer utility matters more than faucet implementation details. The guide should expose the UDT type script, Fiber CCH config, and public Bottle node information directly.
