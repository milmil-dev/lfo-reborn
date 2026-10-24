# Changelog

## [0.7.0](https://github.com/milmil-dev/lfo-reborn/compare/v0.6.0...v0.7.0) (2026-10-24)


### Features

* **game:** faithful 異轉 marker, an honest 出招表, and specials that continue past their wind-up ([#32](https://github.com/milmil-dev/lfo-reborn/issues/32)) ([bf4eab5](https://github.com/milmil-dev/lfo-reborn/commit/bf4eab515dda8764127a2d1d000e8836a69943a5))
* **realtime:** rejoin a room, refresh mid-bout, and show the bout's roster and chat ([#29](https://github.com/milmil-dev/lfo-reborn/issues/29)) ([29c2ea6](https://github.com/milmil-dev/lfo-reborn/commit/29c2ea6da5576b136c43fe3da4d6134cded8bc17))


### Bug Fixes

* **story:** 蜜蜂等 47 種敵人打唔死，房間清唔到，故事模式卡關 ([#31](https://github.com/milmil-dev/lfo-reborn/issues/31)) ([37f6e5a](https://github.com/milmil-dev/lfo-reborn/commit/37f6e5ae84154d44966a58950884846061e0cbd6))

## [0.6.0](https://github.com/milmil-dev/lfo-reborn/compare/v0.5.0...v0.6.0) (2026-10-22)


### Features

* **game:** 摩摩星 follower fights beside the player ([#21](https://github.com/milmil-dev/lfo-reborn/issues/21)) ([97ee529](https://github.com/milmil-dev/lfo-reborn/commit/97ee5299a3e29fed2512bf59c6b7ea69b8becc16))
* **web:** head tags, link previews and the client's favicon ([#23](https://github.com/milmil-dev/lfo-reborn/issues/23)) ([5a8a394](https://github.com/milmil-dev/lfo-reborn/commit/5a8a3943f742eec4203a49420d60c00f1b9cf161))


### Performance Improvements

* **game:** interpolate between ticks and stop rebuilding effects every frame ([#20](https://github.com/milmil-dev/lfo-reborn/issues/20)) ([0ac863c](https://github.com/milmil-dev/lfo-reborn/commit/0ac863cdc089223297774972ad13ac7d9b8c3e51))

## [0.5.0](https://github.com/milmil-dev/lfo-reborn/compare/v0.4.0...v0.5.0) (2026-10-02)


### Features

* **game:** hash the world state and guard the engine's determinism ([#9](https://github.com/milmil-dev/lfo-reborn/issues/9)) ([4011c34](https://github.com/milmil-dev/lfo-reborn/commit/4011c348a84b1addc01d4bfd0c8ef804c18265f2))
* **game:** seat up to three more players at this machine in VS ([#11](https://github.com/milmil-dev/lfo-reborn/issues/11)) ([660ab27](https://github.com/milmil-dev/lfo-reborn/commit/660ab270f8f9675741a281a25726a5cc34ea7bbd))
* **net:** a public room list — 選擇遊戲室 on the client's own art ([#15](https://github.com/milmil-dev/lfo-reborn/issues/15)) ([e88c807](https://github.com/milmil-dev/lfo-reborn/commit/e88c8078ca92ddc83b2c2c50786f46542d4ada51))
* **net:** online game rooms on a Cloudflare Worker, fought in lockstep ([#14](https://github.com/milmil-dev/lfo-reborn/issues/14)) ([e48953a](https://github.com/milmil-dev/lfo-reborn/commit/e48953a3e8a03b3bd9674a41b5ab8a86ad8ba9c4))
* **net:** rollback netcode — the bout runs on the local clock ([#17](https://github.com/milmil-dev/lfo-reborn/issues/17)) ([2c740b1](https://github.com/milmil-dev/lfo-reborn/commit/2c740b11afaf3ccd1c18e49406d0a4a8da6df4aa))


### Bug Fixes

* **game:** rolls, roomier commands and no pinning on the floor ([#16](https://github.com/milmil-dev/lfo-reborn/issues/16)) ([8e97124](https://github.com/milmil-dev/lfo-reborn/commit/8e971245aaf5e2da63109b8b12a3f50a62473ca9))

## [0.4.0](https://github.com/milmil-dev/lfo-reborn/compare/v0.3.0...v0.4.0) (2026-10-01)


### Features

* **game:** 合體 fusion at 毛毛高 ([#12](https://github.com/milmil-dev/lfo-reborn/issues/12)) ([01cd169](https://github.com/milmil-dev/lfo-reborn/commit/01cd16998f5eaccd092cda24c2e15136d055a3d8))


### Bug Fixes

* **story:** always finish scripted moves so drama scenes cannot hang ([#10](https://github.com/milmil-dev/lfo-reborn/issues/10)) ([aea19a2](https://github.com/milmil-dev/lfo-reborn/commit/aea19a25a684e0878d2f6390bed2c147d71000ed))

## [0.3.0](https://github.com/milmil-dev/lfo-reborn/compare/v0.2.0...v0.3.0) (2026-10-01)


### Features

* **game:** bows fire arrows and shields block ([#6](https://github.com/milmil-dev/lfo-reborn/issues/6)) ([7fd28bd](https://github.com/milmil-dev/lfo-reborn/commit/7fd28bd26d5e3a0dde87e94e9761973e7e888fcd))
* **game:** keys and locked doors ([#8](https://github.com/milmil-dev/lfo-reborn/issues/8)) ([08eb2f3](https://github.com/milmil-dev/lfo-reborn/commit/08eb2f3ba01ad62b31cee1cd8899cc9454c482e8))

## [0.2.0](https://github.com/milmil-dev/lfo-reborn/compare/v0.1.0...v0.2.0) (2026-10-01)


### Features

* **game:** playtest fixes, SP guarding, original level caps and release notes ([#4](https://github.com/milmil-dev/lfo-reborn/issues/4)) ([0102e51](https://github.com/milmil-dev/lfo-reborn/commit/0102e5177f5aa08a784b8655f9b287707eddb457))

## 0.1.0 (2026-10-01)


### Features

* **web:** name each screen in the tab title ([bbb50b7](https://github.com/milmil-dev/lfo-reborn/commit/bbb50b7))
* serve the API as a static JSON snapshot ([b054e82](https://github.com/milmil-dev/lfo-reborn/commit/b054e82))
* **web:** the game client — engine, story mode, lobby and HD UI ([aa0b813](https://github.com/milmil-dev/lfo-reborn/commit/aa0b813))
* **api:** read-only Go API over the rebuilt database ([b80b746](https://github.com/milmil-dev/lfo-reborn/commit/b80b746))
* **pipeline:** rebuild game data from the original client ([e298f4a](https://github.com/milmil-dev/lfo-reborn/commit/e298f4a))


### Bug Fixes

* **game:** let a knocked-down fighter get back up ([#3](https://github.com/milmil-dev/lfo-reborn/issues/3)) ([42f2ed9](https://github.com/milmil-dev/lfo-reborn/commit/42f2ed9))
* **story:** give every character the common chapters ([48f390a](https://github.com/milmil-dev/lfo-reborn/commit/48f390a))
* **web:** drop the museum's view transitions ([10bfc43](https://github.com/milmil-dev/lfo-reborn/commit/10bfc43))
