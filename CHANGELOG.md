# Changelog

## [1.1.2](https://github.com/highaltidude/FermentOS/compare/fermentos-v1.1.1...fermentos-v1.1.2) (2026-08-12)


### Bug Fixes

* **settings:** declutter the app updates panel ([f6a6182](https://github.com/highaltidude/FermentOS/commit/f6a618257a7fbecb507f4bf491b1d259e723c68d))

## [1.1.1](https://github.com/highaltidude/FermentOS/compare/fermentos-v1.1.0...fermentos-v1.1.1) (2026-08-06)


### Bug Fixes

* **admin:** correct release-notes newer-than-current flag and hide cross-channel prereleases ([7157560](https://github.com/highaltidude/FermentOS/commit/7157560598199dff5b528db56c03f702a617d7d6))

## [1.1.0](https://github.com/highaltidude/FermentOS/compare/fermentos-v1.0.1...fermentos-v1.1.0) (2026-08-06)


### Features

* **inventory:** add cost per unit to ingredients ([8cdb841](https://github.com/highaltidude/FermentOS/commit/8cdb8415af09bd060c7088a2cc66293da24ee57b))


### Bug Fixes

* **settings:** correct stale Home Assistant integration docs ([40845e8](https://github.com/highaltidude/FermentOS/commit/40845e851f963a9207d9a76bf83b9baac9dea335))

## [1.0.1](https://github.com/highaltidude/FermentOS/compare/fermentos-v1.0.0...fermentos-v1.0.1) (2026-07-25)


### Bug Fixes

* stop beta and main release-please from colliding on shared files ([#113](https://github.com/highaltidude/FermentOS/issues/113)) ([3a8a025](https://github.com/highaltidude/FermentOS/commit/3a8a025d769939d94bab873a6a4c8f7fd05012df))

## 1.0.0 (2026-07-25)


### Features

* add /api/ha/status endpoint with full telemetry and fermentation insights ([#55](https://github.com/highaltidude/FermentOS/issues/55)) ([ffa986b](https://github.com/highaltidude/FermentOS/commit/ffa986b56902758b784485281bfb3707f93fbd25))
* add background update checker with 24h toast notification ([#58](https://github.com/highaltidude/FermentOS/issues/58)) ([43fdeb9](https://github.com/highaltidude/FermentOS/commit/43fdeb96c1e11a1e83fc123d44d361952b48a63c))
* add Calculators page with coming soon placeholder ([#68](https://github.com/highaltidude/FermentOS/issues/68)) ([7054c69](https://github.com/highaltidude/FermentOS/commit/7054c69bd92f3d319116b531b04f687222d1f4ca))
* add configurable reading retention with nightly cleanup ([#45](https://github.com/highaltidude/FermentOS/issues/45)) ([ea35ec5](https://github.com/highaltidude/FermentOS/commit/ea35ec5ddf60e56426b4fa9a4a571c2612cd0e05))
* add copy to clipboard button for commit hash in App Updates ([#63](https://github.com/highaltidude/FermentOS/issues/63)) ([ef77b59](https://github.com/highaltidude/FermentOS/commit/ef77b5907c9bb49af4f190c7d61d47b5c85550fe))
* add days in current stage and live sensor panel to dashboard ([#78](https://github.com/highaltidude/FermentOS/issues/78)) ([b878469](https://github.com/highaltidude/FermentOS/commit/b878469a6d5b60f2d5f9c7d5b97d1cd272f829cc))
* add Docker Compose support for NAS, mini PC, and VM installs ([#51](https://github.com/highaltidude/FermentOS/issues/51)) ([f114c15](https://github.com/highaltidude/FermentOS/commit/f114c15e094b969c61eb9d3b3d9cc32ac2b15283))
* add docker-install.sh with interactive port prompt ([5fd8c9f](https://github.com/highaltidude/FermentOS/commit/5fd8c9fe165651f021806f252bdb151e5f6f8f4c))
* add estimated ABV to dashboard active brew cards and iSpindel tile ([#73](https://github.com/highaltidude/FermentOS/issues/73)) ([375b3a1](https://github.com/highaltidude/FermentOS/commit/375b3a1a795fc2de4ae50ecd769c2e3a0bf7f1eb))
* add global Express error handler middleware ([#38](https://github.com/highaltidude/FermentOS/issues/38)) ([c9538e2](https://github.com/highaltidude/FermentOS/commit/c9538e262608348f6b01d8a3034f436a9a28bd9c))
* add inline OG capture prompt on brew day ([#82](https://github.com/highaltidude/FermentOS/issues/82)) ([ac4d7d2](https://github.com/highaltidude/FermentOS/commit/ac4d7d2119147a4f4b6b05809e9be7f5d02d7468))
* add read/write scope to API tokens ([#43](https://github.com/highaltidude/FermentOS/issues/43)) ([184b580](https://github.com/highaltidude/FermentOS/commit/184b580e23117151d1a89007c15e512f932bfe20))
* add rename device option to iSpindel device cards ([#56](https://github.com/highaltidude/FermentOS/issues/56)) ([61f3855](https://github.com/highaltidude/FermentOS/commit/61f3855629643a9c7cf4609f797fdc077f59ea96))
* add scope selector and badge to API token UI ([#44](https://github.com/highaltidude/FermentOS/issues/44)) ([8bc4c45](https://github.com/highaltidude/FermentOS/commit/8bc4c45fe342d123dff792f94f789b3c771f1690))
* add SFTP-to-local fallback for scheduled backups ([#90](https://github.com/highaltidude/FermentOS/issues/90)) ([099f5f3](https://github.com/highaltidude/FermentOS/commit/099f5f3cd1bbcc1b4326824d9004b9b60af08a25))
* Add source indicator and filter to Fermentation Readings ([#35](https://github.com/highaltidude/FermentOS/issues/35)) ([07a03c5](https://github.com/highaltidude/FermentOS/commit/07a03c51e31cf5368fe58a8cbc11f1d25aa7193a))
* add unassigned iSpindel banner on active brew session ([#83](https://github.com/highaltidude/FermentOS/issues/83)) ([d34b2d3](https://github.com/highaltidude/FermentOS/commit/d34b2d384b5559452ab1f797611a6f7c96a9036c))
* auto-calculate ABV when session is marked as packaged ([#76](https://github.com/highaltidude/FermentOS/issues/76)) ([d8ce908](https://github.com/highaltidude/FermentOS/commit/d8ce908b96557356c1a0b8d931a038ee5aee232e))
* auto-unassign sensor devices when brew session is marked packaged ([#96](https://github.com/highaltidude/FermentOS/issues/96)) ([6a992a8](https://github.com/highaltidude/FermentOS/commit/6a992a82a6e71e3bb825999ccb14758051964ef9))
* collapse fermentation readings by default with configurable count in settings ([#57](https://github.com/highaltidude/FermentOS/issues/57)) ([db7dd11](https://github.com/highaltidude/FermentOS/commit/db7dd11aa181a3e7057577d8fc2bbbda1e56dfa2))
* dark theme as default + warm charcoal palette polish ([#25](https://github.com/highaltidude/FermentOS/issues/25)) ([4c60d58](https://github.com/highaltidude/FermentOS/commit/4c60d58bc9c1cdb1b60dd11d22fc597f7d4d9d61))
* detect Docker and adapt system management UI ([3843d41](https://github.com/highaltidude/FermentOS/commit/3843d414a58671a2100e21c30fe04c507a7e43d7))
* fermentation temp range alerts and ideal temp deviation tracking ([#95](https://github.com/highaltidude/FermentOS/issues/95)) ([7db41c4](https://github.com/highaltidude/FermentOS/commit/7db41c4eac7d5c208c911408df38cf2cf95db9ec))
* Home Assistant REST sensor endpoint at /api/ha/status ([#23](https://github.com/highaltidude/FermentOS/issues/23)) ([e924e18](https://github.com/highaltidude/FermentOS/commit/e924e187904dac0491795df1f261c98c9e614d1d))
* improve update progress display with step indicators and live log output ([#64](https://github.com/highaltidude/FermentOS/issues/64)) ([11c6290](https://github.com/highaltidude/FermentOS/commit/11c62904d3cf4ba05ab4ac4d066f9b0d26a2f607))
* ingredient autocomplete when adding to recipes ([4e8f176](https://github.com/highaltidude/FermentOS/commit/4e8f1765715d90ede0027641e804e48217188039))
* native iSpindel integration (sensor ingest pipeline) ([3495011](https://github.com/highaltidude/FermentOS/commit/34950119c2f0b0ca56fa112de50f6272ff72aaa8))
* native iSpindel integration (sensor ingest pipeline) ([#26](https://github.com/highaltidude/FermentOS/issues/26)) ([#27](https://github.com/highaltidude/FermentOS/issues/27)) ([23d17f5](https://github.com/highaltidude/FermentOS/commit/23d17f5d9615146ac1a2c616bc837c32dc64f66b))
* per-brew fermentation temperature range alerts ([#94](https://github.com/highaltidude/FermentOS/issues/94)) ([066b8d5](https://github.com/highaltidude/FermentOS/commit/066b8d591cbd666a2f7d445ce87d2e55de8a7176))
* Settings → Backups — Local Backup Browser + Backup Audit ([#22](https://github.com/highaltidude/FermentOS/issues/22)) ([24faf53](https://github.com/highaltidude/FermentOS/commit/24faf531aa947f402bc05c1c616182e0e4e661f1))
* show conditioning nudge when fermentation appears complete ([#80](https://github.com/highaltidude/FermentOS/issues/80)) ([c9f0d59](https://github.com/highaltidude/FermentOS/commit/c9f0d5987e48562eafb588cb176f1a57ea9811a4))
* show hostname in Health card ([#70](https://github.com/highaltidude/FermentOS/issues/70)) ([bf44ea9](https://github.com/highaltidude/FermentOS/commit/bf44ea949f586c9f26cd475b2fb44adf4388ba6c))
* show relative deployed time in App Updates card ([#66](https://github.com/highaltidude/FermentOS/issues/66)) ([052dd5a](https://github.com/highaltidude/FermentOS/commit/052dd5a91fc6b19a38bb313c68674868185882cf))
* unit system preference + inventory unit dropdown ([0865325](https://github.com/highaltidude/FermentOS/commit/0865325a4b6749b6de47909481a6093acab6464d))


### Bug Fixes

* abort verifying phase poll loop when update completes ([#69](https://github.com/highaltidude/FermentOS/issues/69)) ([de82cde](https://github.com/highaltidude/FermentOS/commit/de82cdef3e0f9f23b259a449661a008990568481))
* add `and` to drizzle-orm import in recipes route ([#40](https://github.com/highaltidude/FermentOS/issues/40)) ([88c47b6](https://github.com/highaltidude/FermentOS/commit/88c47b6f75f39c560ff01e136adc7b8bf0dd8496))
* add sensor tables to backup registry ([#28](https://github.com/highaltidude/FermentOS/issues/28)) ([22162fb](https://github.com/highaltidude/FermentOS/commit/22162fba8986e8cc8240e6a46150c1591b10f699))
* add verifying phase to update progress bar before showing Reload button ([#59](https://github.com/highaltidude/FermentOS/issues/59)) ([c3861a9](https://github.com/highaltidude/FermentOS/commit/c3861a9cfe5b499358db8be48b2f9257560aa4b1))
* auto-rollback to previous commit if build fails during update ([#46](https://github.com/highaltidude/FermentOS/issues/46)) ([56e1698](https://github.com/highaltidude/FermentOS/commit/56e1698d4786db1c6f4dc6672acba2cbaa51a2f7))
* auto-sync git repo before docker build in install script ([#86](https://github.com/highaltidude/FermentOS/issues/86)) ([eacfa2d](https://github.com/highaltidude/FermentOS/commit/eacfa2db124c07e18098da1eef0b911c33012c47))
* backup and restore .env during install to prevent data loss ([#53](https://github.com/highaltidude/FermentOS/issues/53)) ([39d5c36](https://github.com/highaltidude/FermentOS/commit/39d5c36c37c6fc8d08e3d4ec03cd11be330e2d74))
* defer Reload now button until server confirms ready after update ([#67](https://github.com/highaltidude/FermentOS/issues/67)) ([92eb2c6](https://github.com/highaltidude/FermentOS/commit/92eb2c6fa095221378f17200eb96d05483de2c70))
* docker enhancements ([40ba35c](https://github.com/highaltidude/FermentOS/commit/40ba35ce8858d63fe7685ad65b2ad3725460cfee))
* hide live sensor card when device is unassigned from brew session ([#97](https://github.com/highaltidude/FermentOS/issues/97)) ([6d77d2e](https://github.com/highaltidude/FermentOS/commit/6d77d2e84b239e00a7fc3217a3dfead683f75e65))
* install postgresql-client in Docker runner stage for pg_dump and psql ([#91](https://github.com/highaltidude/FermentOS/issues/91)) ([9f3108e](https://github.com/highaltidude/FermentOS/commit/9f3108e6570a10d73f2e17d892b4ffab9b1d54c4))
* iSpindel brew telemetry uses assignment time windows, not brewSessionId ([#33](https://github.com/highaltidude/FermentOS/issues/33)) ([f69b4a3](https://github.com/highaltidude/FermentOS/commit/f69b4a315a492f06b1f7c821fadaad5a2d96d3cc))
* prevent file permission changes from blocking GUI updates ([#49](https://github.com/highaltidude/FermentOS/issues/49)) ([d04d2df](https://github.com/highaltidude/FermentOS/commit/d04d2df556619020ef80ae794cd5a68041666638))
* prevent file permission changes from blocking GUI updates ([#50](https://github.com/highaltidude/FermentOS/issues/50)) ([04cb935](https://github.com/highaltidude/FermentOS/commit/04cb935743ae871b57e9723dc8172455cbf0d39a))
* prevent premature auto-advance to conditioning when iSpindel gravity rises during normalization ([#100](https://github.com/highaltidude/FermentOS/issues/100)) ([21d3506](https://github.com/highaltidude/FermentOS/commit/21d350644c3a9200a911acf915cc5734a0f1a322))
* push brew session filtering to DB layer with proper ordering ([#36](https://github.com/highaltidude/FermentOS/issues/36)) ([0fc17c5](https://github.com/highaltidude/FermentOS/commit/0fc17c5ba4eb1cd7fa3751fd7b3822e8358324cb))
* raise backup retention clamp from 30 to 60 days ([#89](https://github.com/highaltidude/FermentOS/issues/89)) ([c5a8ba0](https://github.com/highaltidude/FermentOS/commit/c5a8ba088c6af68aa52e273775f0222b6625931d))
* refresh audit coverage on demand; prevent stale 79% on App Updates ([#29](https://github.com/highaltidude/FermentOS/issues/29)) ([4140b8a](https://github.com/highaltidude/FermentOS/commit/4140b8a144e9bc15e615f414e74181718981e5c3))
* remove doubled /integrations prefix from iSpindel route handlers ([#30](https://github.com/highaltidude/FermentOS/issues/30)) ([6079809](https://github.com/highaltidude/FermentOS/commit/6079809e1d8cf2d0a3ffa1348040bc7bd8dc8af1))
* remove duplicate git reset in update.sh ([#54](https://github.com/highaltidude/FermentOS/issues/54)) ([0b05983](https://github.com/highaltidude/FermentOS/commit/0b059833be25a94a9a0cf34e871213b981ffa4b2))
* remove git clean -fd from update script ([#52](https://github.com/highaltidude/FermentOS/issues/52)) ([0068083](https://github.com/highaltidude/FermentOS/commit/00680831dfeecbdd1c8474503a2fb6e0f2390a67))
* remove redundant git pull from UI update instructions ([#87](https://github.com/highaltidude/FermentOS/issues/87)) ([5ab139b](https://github.com/highaltidude/FermentOS/commit/5ab139bff39cb7134ecd835d6022e872ed7c39f5))
* run drizzle migrations between schema wipe and data replay on restore ([#92](https://github.com/highaltidude/FermentOS/issues/92)) ([950d0e4](https://github.com/highaltidude/FermentOS/commit/950d0e4444377b2b46f9b3a16b380176995bea56))
* show update progress UI immediately with placeholder text during verifying phase ([#71](https://github.com/highaltidude/FermentOS/issues/71)) ([456d2de](https://github.com/highaltidude/FermentOS/commit/456d2dec5985bfce101188b4d2b648b2ae0eda44))
* skip fermentation reading mirror for packaged brew sessions ([#93](https://github.com/highaltidude/FermentOS/issues/93)) ([d795d11](https://github.com/highaltidude/FermentOS/commit/d795d117fa2a275b76947c54cec7741bbc0f5e6e))
* suppress temp out of range toast when sensor device is inactive ([#98](https://github.com/highaltidude/FermentOS/issues/98)) ([858a11b](https://github.com/highaltidude/FermentOS/commit/858a11b7b21ccf125922c0205e127d07eaedfde3))
* unlink sensor reading from brew session when fermentation reading is deleted ([#81](https://github.com/highaltidude/FermentOS/issues/81)) ([2c4e66f](https://github.com/highaltidude/FermentOS/commit/2c4e66f79ae2cfe67feb834a283f674e8130bdce))
* use timestamptz for all event timestamps, fix frontend date parsing ([94ccfbc](https://github.com/highaltidude/FermentOS/commit/94ccfbcf31f78bd96d3ba0761bedeb2cd4229328))
* use timestamptz for all event timestamps, fix frontend date parsing ([00bb8cb](https://github.com/highaltidude/FermentOS/commit/00bb8cbfa42c3310dc0fbee82fbf37411cd7fd91))
* wait for clean API state before reloading after update ([#61](https://github.com/highaltidude/FermentOS/issues/61)) ([add465c](https://github.com/highaltidude/FermentOS/commit/add465ce8c28709b8b51aa6d7ff99f1783eb9f49))
