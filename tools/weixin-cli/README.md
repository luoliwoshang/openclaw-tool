# openclaw-weixin-installer

OpenClaw 微信消息通道插件的统一安装器。自动检测宿主 OpenClaw 版本，安装兼容的插件版本。

## 快速开始

```bash
npx -y @tencent-weixin/openclaw-weixin-cli install
```

安装器会自动完成以下步骤：
1. 检测本地 `openclaw --version`
2. 根据兼容矩阵选择合适的插件版本（dist-tag）
3. 调用 `openclaw plugins install` 安装对应版本
4. 引导扫码连接微信
5. 重启 OpenClaw Gateway

**无需手动指定版本号。**

## 兼容矩阵

| openclaw-weixin | 支持的 OpenClaw       | dist-tag                              | 说明                 |
|-----------------|-----------------------|---------------------------------------|----------------------|
| 1.0.x           | >=2026.3.0 <2026.3.22 | `compat-host-gte2026.3.0-lt2026.3.22` | 兼容轨道             |
| 2.0.x           | >=2026.3.22           | `latest`                              | 当前推荐主线         |

> 从 2.0.0 开始，插件采用独立 semver 版本号，不再对齐宿主 OpenClaw 版本号。

## 手动安装

如果需要手动指定版本，可以直接使用 openclaw 命令：

```bash
# 查看当前 OpenClaw 版本
openclaw --version

# 当前推荐主线 (>=2026.3.22)
openclaw plugins install @tencent/openclaw-weixin@latest

# 兼容轨道 (<2026.3.22)
openclaw plugins install @tencent/openclaw-weixin@compat-host-gte2026.3.0-lt2026.3.22
```

## 运行时版本校验

插件在启动时会自动检查宿主版本兼容性。如果版本不匹配，将立即抛出错误：

```
[openclaw-weixin] 宿主版本不兼容!
  当前 OpenClaw 版本: 2026.3.10
  当前插件支持范围:   >=2026.3.22
  请安装 openclaw-weixin@compat-host-gte2026.3.0-lt2026.3.22
  或运行: npx @tencent-weixin/openclaw-weixin-cli install (自动选择兼容版本)
```

## 故障排查

### 宿主版本不兼容

**症状**：插件启动时报 `宿主版本不兼容` 错误。

**解决**：
```bash
# 1. 确认 OpenClaw 版本
openclaw --version

# 2. 用统一安装器重新安装（自动匹配版本）
npx -y @tencent-weixin/openclaw-weixin-cli install
```

### 如何查看当前 openclaw 版本

```bash
openclaw --version
```

## 发布策略

### 本仓库（CLI installer）与插件仓库的关系

本仓库发布的是 **CLI 安装器**（`openclaw-weixin-cli`），不是插件本身（`openclaw-weixin`）。

- **插件仓库**：openclaw-weixin，通过各分支发布到不同的 npm dist-tag
- **本仓库**：CLI 安装器，根据 `COMPAT_MATRIX` 自动选择正确的插件 dist-tag 来安装

### 分支管理规则

内网和外网通过不同分支管理，prerelease 分支从主分支拉出，合并回主分支：

| 分支 | 用途 | package.json 状态 |
|------|------|------------------|
| `master-prerelease` | 日常开发 + 内网发布 | 内网发布后保持内网包名和版本 |
| `master` | 外网发布 | 外网发布后保持外网包名和版本 |

**核心原则：**
- 日常开发和内网发布在 `-prerelease` 分支上进行
- 需要发外网时，将 prerelease 分支合入对应主分支，再在主分支上发布
- 发布后 package.json **不回退**，分支保持对应环境的最新发布状态
- prerelease 和主分支同构（共用 `publish.config.json`），合并时自然更新

### CLI 发布命令

```bash
# 在 prerelease 分支上发布内网
node scripts/publish.mjs internal patch

# dry run 预检
node scripts/publish.mjs internal patch --dry-run
```

发布脚本会：
1. 检查工作区是否干净
2. 将 `package.json` 的 name/version 和 `cli.mjs` 的 PLUGIN_SPEC 替换为目标环境的值
3. 更新 `publish.config.json` 中对应目标的版本号
4. 提交 release commit 并打 git tag
5. npm publish
6. push commit + tag

发布后 package.json 保持发布态，不回退。如果 npm publish 失败，自动回滚 release commit 和 tag。

### 内网验证后发外网

```bash
# ① 在 prerelease 分支上完成内网发布和验证

# ② 合入主分支
git checkout master
git merge master-prerelease

# ③ 在主分支上发布外网
node scripts/publish.mjs external patch
```

### 兼容轨道发版流程

当 openclaw 发布破坏兼容性的新版本时：

#### 1. 插件仓库操作（openclaw-weixin）

```bash
# 从当前分支拉出兼容轨道
git checkout -b compat-host-gteX.Y.Z-ltA.B.C-prerelease master-prerelease
git checkout -b compat-host-gteX.Y.Z-ltA.B.C master
# 修改 compat 分支上的 publish.config.json，将 npmTag 改为轨道名

# master-prerelease 上适配新宿主，major + 1
```

#### 2. CLI 仓库操作（本仓库）

```bash
# ① 更新 lib/compat.mjs 的 COMPAT_MATRIX

# ② 在 prerelease 分支上发布内网验证
node scripts/publish.mjs internal minor

# ③ 验证后合入主分支发外网
git checkout master && git merge master-prerelease
node scripts/publish.mjs external minor
```

#### 3. 验证清单

- [ ] `npx @tencent/openclaw-weixin-cli install` 在旧宿主上安装兼容轨道版本
- [ ] `npx @tencent/openclaw-weixin-cli install` 在新宿主上安装 latest 版本
- [ ] 已安装旧 tag 的用户重跑 CLI 后自动卸载旧版、安装新版
- [ ] 插件运行时 `version-check.mjs` 报错信息指引正确

### 兼容轨道 bug 修复

```bash
# ① 在 compat prerelease 分支上修复
git checkout compat-host-gteX.Y.Z-ltA.B.C-prerelease
# cherry-pick 或直接修复
node scripts/publish.mjs internal patch

# ② 需要发外网时合入 compat 主分支
git checkout compat-host-gteX.Y.Z-ltA.B.C
git merge compat-host-gteX.Y.Z-ltA.B.C-prerelease
node scripts/publish.mjs external patch

# ③ 评估是否需要同步到 master 和其他 compat 分支
```

> CLI 不需要重新发布——同一 dist-tag 下的 patch 更新，用户通过 `openclaw plugins update` 即可获取。

## 开发

```bash
# 安装开发依赖
npm install

# 本地测试 install 命令
node cli.mjs install
```
