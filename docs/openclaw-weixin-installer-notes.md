# OpenClaw 微信安装器阅读笔记

这份文档整理了当前仓库里 `tools/weixin-cli` 以及 OpenClaw 插件安装机制相关的核心概念，目标是把前面讨论过的易混点放到一处，后续继续看源码时可以反复对照。

## 1. 当前仓库里的对象

- `tools/weixin-cli`
  - 这是从 npm 包 `@tencent-weixin/openclaw-weixin-cli@2.1.1` 拉下来的安装器快照
  - 不是微信插件本体，而是安装器 CLI
- `@tencent-weixin/openclaw-weixin`
  - 这是微信插件本体
  - 安装器的工作之一就是替你调用 `openclaw plugins install` 去安装它

## 2. `npm` / `npx` / `bin` 是什么关系

### 2.1 `npm`

`npm` 是 Node 生态里的包管理工具，常见职责包括：

- 安装依赖
- 发布包
- 运行 package script

常见命令：

```bash
npm install
npm publish
npm run build
```

### 2.2 `npx`

`npx` 可以理解成“临时执行某个 npm 包暴露出来的命令”。

例如：

```bash
npx -y @tencent-weixin/openclaw-weixin-cli install
```

这条命令的核心不是“安装依赖到当前项目”，而是：

1. 临时获取 `@tencent-weixin/openclaw-weixin-cli`
2. 找到它在 `package.json` 里声明的 `bin`
3. 执行那个命令，并把后面的 `install` 当作参数传进去

### 2.3 `bin`

`tools/weixin-cli/package.json` 里有：

```json
"bin": {
  "weixin-installer": "./cli.mjs"
}
```

意思是：

- 这个包暴露了一个命令：`weixin-installer`
- 执行这个命令时，真正跑的是 `cli.mjs`

所以：

```bash
npx -y @tencent-weixin/openclaw-weixin-cli install
```

可以近似理解成：

```bash
weixin-installer install
```

再近似理解成：

```bash
node ./tools/weixin-cli/cli.mjs install
```

这里的 `install` 不是 npm 内置命令，而是这个 CLI 作者自己定义的子命令。

## 3. 安装器入口文件在干什么

入口文件是：

- `tools/weixin-cli/cli.mjs`

它的职责不是实现微信协议本身，而是做一层“命令调度”：

- 检查本机有没有 `openclaw`
- 读取 `openclaw --version`
- 根据兼容矩阵选对插件 tag
- 调用 `openclaw plugins install` 或 `openclaw plugins update`
- 调用 `openclaw channels login --channel openclaw-weixin`
- 调用 `openclaw gateway restart`

一句话概括：

`openclaw-weixin-cli` 是 OpenClaw 微信插件的安装与接入引导器，不是插件本体。

## 4. `2.1.1` 和 `2.11` 不是一回事

`2.1.1` 是标准 semver：

- major = 2
- minor = 1
- patch = 1

它不是 `2.11`。如果是 `2.11` 这条线，通常会写成：

- `2.11.0`
- `2.11.x`

## 5. `dist-tag` 是什么

`dist-tag` 不是版本号，而是 npm registry 上的一个“标签名”，指向某个真实版本。

例如当前微信插件包的 tag 映射：

```json
{
  "legacy": "1.0.3",
  "compat-host-gte2026.3.0-lt2026.3.22": "1.0.3",
  "latest": "2.1.1"
}
```

所以：

- `latest` 指向 `2.1.1`
- `compat-host-gte2026.3.0-lt2026.3.22` 当前也只是一个标签名，它现在指向 `1.0.3`

安装器用 tag 而不是写死具体版本，是因为 tag 更方便维护兼容轨道。

## 6. 兼容矩阵在找什么

兼容矩阵定义在：

- `tools/weixin-cli/lib/compat.mjs`

核心逻辑是：

- 当前 `openclaw` 宿主版本落在哪个区间
- 然后选对应的微信插件安装轨道

例如：

```js
openclawRange: { gte: '2026.3.0', lt: '2026.3.22' }
```

含义是：

- `>= 2026.3.0`
- 且 `< 2026.3.22`

其中：

- `gte` = greater than or equal = 大于等于
- `lt` = less than = 小于

`findCompatEntry(openclawVersion)` 做的事就是：

- 遍历兼容矩阵
- 找到第一条满足当前宿主版本区间的规则
- 返回那条规则

## 7. 这条 `npx` 命令实际会做什么

```bash
npx -y @tencent-weixin/openclaw-weixin-cli install
```

在当前安装器代码里，大致会做这些事：

1. 检查 `openclaw` 命令是否存在
2. 执行 `openclaw --version`
3. 根据宿主版本选插件 tag
4. 如果当前跟踪的是错误轨道，先卸载旧插件
5. 安装或更新 `@tencent-weixin/openclaw-weixin`
6. 对个别宿主版本补一个 `node_modules/openclaw` 的 symlink
7. 执行：

```bash
openclaw channels login --channel openclaw-weixin
```

8. 执行：

```bash
openclaw gateway restart
```

也就是说，它本质上是在“编排一组 `openclaw` 命令”，不是自己绕过 OpenClaw 直接接管微信。

## 8. OpenClaw 里的“安装”不是只写配置

这是最容易误解的地方。

在 OpenClaw 里，`plugins install` 不是“只在配置文件里声明一下插件”。它至少分成两层：

### 8.1 文件层 / 安装层

插件会被真正放到可加载位置：

- 正常安装：进入扩展目录
- `--link` 安装：加入 `plugins.load.paths`

官方文档里写得很明确：

- `openclaw plugins install <path|.tgz|npm-spec|plugin@marketplace>` 是安装插件
- `--link` 才是避免复制文件，仅把路径加到 `plugins.load.paths`
- `uninstall` 默认会删除 state-dir plugin root 里的安装目录

### 8.2 配置层

安装之后，OpenClaw 还会把信息写进配置：

- `plugins.installs`
- `plugins.entries`
- 或 `plugins.load.paths`

所以更准确地说：

- 安装 = 文件层 + 安装记录层
- 启用/禁用 = 运行开关层

## 9. `plugins.installs` 是干什么的

`plugins.installs` 是由 OpenClaw CLI 管理的安装元数据。

它记录的典型信息包括：

- `source`
- `spec`
- `installPath`
- `version`
- `resolvedVersion`
- `resolvedSpec`

它主要用于：

- 追踪这个插件是怎么安装的
- 支持 `openclaw plugins update`

你可以把它理解成“插件安装记录表”。

## 10. `plugins.entries` 是干什么的

OpenClaw 文档里的这句：

> `plugins.entries`: per-plugin settings keyed by plugin ID

可以直白地理解成：

**“一个按插件 ID 做 key 的插件配置字典。”**

例如：

```json
{
  "plugins": {
    "entries": {
      "openclaw-weixin": {
        "enabled": true
      },
      "google": {
        "enabled": true,
        "config": {
          "webSearch": {
            "apiKey": "xxx"
          }
        }
      }
    }
  }
}
```

这里：

- `openclaw-weixin`
- `google`

都是 plugin ID。

而每个 key 对应的是这个插件自己的运行配置。

所以：

- `plugins.installs` 管“这个插件怎么装进来的”
- `plugins.entries` 管“这个插件运行时怎么配置”

## 11. `plugins.entries.*.enabled` 是什么

这是插件的启用开关。

它表达的是：

- 这个插件在当前配置下要不要启用

它不是：

- 安装来源
- 安装版本
- 安装轨道

所以：

- 安装了一个插件，不等于只靠 `enabled` 就能表示完整状态
- `enabled` 只是运行时开关

## 12. `spec` / `resolvedSpec` / `version` 的区别

### 12.1 `spec`

`spec` 更像“安装规格”或“安装意图”。

例如：

- `@tencent-weixin/openclaw-weixin@latest`
- `@tencent-weixin/openclaw-weixin@compat-host-gte2026.3.0-lt2026.3.22`
- `@tencent-weixin/openclaw-weixin@2.1.1`

它表示“当初是按什么 selector 装的”。

### 12.2 `resolvedSpec`

`resolvedSpec` 更像“解析后的精确安装规格”。

例如：

- `@tencent-weixin/openclaw-weixin@2.1.1`

即使当初传入的是 `@latest`，最终解析以后也可能得到一个精确版本。

### 12.3 `version`

`version` 是当前装出来的实际版本号，例如：

- `2.1.1`

### 12.4 为什么安装器要优先看 `spec`

因为安装器关心的是：

- 当前被记录的是哪条安装轨道
- 后续 `update <id>` 会沿着哪条 spec 继续更新

而 OpenClaw 官方更新逻辑会复用 recorded install spec。

所以如果目标应该从 `latest` 切到兼容轨道，仅仅看当前真实版本不够，安装器还得看：

- 当前跟踪的是不是错误的 `spec`

### 12.5 一个真实例子

下面是一份实际观察到的 `~/.openclaw/openclaw.json` 片段：

```json
"plugins": {
  "entries": {
    "openclaw-weixin": {
      "enabled": true
    }
  },
  "installs": {
    "openclaw-weixin": {
      "source": "npm",
      "spec": "@tencent-weixin/openclaw-weixin@compat-host-gte2026.3.0-lt2026.3.22",
      "installPath": "/Users/zhangzhiyang/.openclaw/extensions/openclaw-weixin",
      "version": "1.0.3",
      "resolvedName": "@tencent-weixin/openclaw-weixin",
      "resolvedVersion": "1.0.3",
      "resolvedSpec": "@tencent-weixin/openclaw-weixin@1.0.3",
      "integrity": "sha512-TOo9rb5gt3ce3lJEulFT5Ta4/8ocWkR40wzM7lZ8OM3/fjTk3UHYeNjHmDcZlLeg93XYJKdVUFUEiujrf8zMYw==",
      "shasum": "19f65f26d4af26a25f05cdd5f1dd3c687590f91c",
      "resolvedAt": "2026-03-31T09:40:00.555Z",
      "installedAt": "2026-03-31T09:41:58.572Z"
    }
  }
}
```

这个例子能同时说明几件事：

- `plugins.entries.openclaw-weixin.enabled = true`
  - 插件当前被启用了
- `installPath = ~/.openclaw/extensions/openclaw-weixin`
  - 插件确实被安装到了扩展目录，不是只写了配置
- `spec = @tencent-weixin/openclaw-weixin@compat-host-gte2026.3.0-lt2026.3.22`
  - 当前记录的安装轨道是 compat 轨道
- `version = 1.0.3`
  - 当前实际安装出来的版本是 `1.0.3`
- `resolvedSpec = @tencent-weixin/openclaw-weixin@1.0.3`
  - registry 最终解析得到的精确安装规格是 `1.0.3`

这正是“不加 `--pin`”时最典型的形态：

- `spec` 保留原始 selector / dist-tag
- `resolvedSpec` 保留解析后的精确版本

也正因为如此，安装器检查 `spec` 才是合理的。它真正关心的是：

- 当前被记录到的是哪条安装线路
- 后续 `update <id>` 会沿着哪条线路继续更新

## 13. `--pin` 是什么

`--pin` 是 OpenClaw 的一个显式选项，用在 npm 安装场景里。

它的作用是：

- 把记录下来的安装 spec 固定到精确版本

简化理解：

- 默认安装：保留原始 selector，例如 `@latest`
- `--pin` 安装：把记录改成精确的 `name@version`

这意味着：

- 不加 `--pin`：后续 `update <id>` 仍然沿着 tag 走
- 加了 `--pin`：后续记录会偏向锁到精确版本

## 14. 微信安装器会不会调用 `--pin`

不会。

当前 `tools/weixin-cli/cli.mjs` 里真正执行的是：

```bash
openclaw plugins install "@tencent-weixin/openclaw-weixin@<dist-tag>"
```

或者：

```bash
openclaw plugins update "openclaw-weixin"
```

没有附带 `--pin`。

所以它走的是：

- 按 dist-tag 选择轨道
- 不锁死到精确版本

## 15. 微信安装器为什么要读 `plugins.installs.<id>.spec`

当前安装器里有这段逻辑：

```js
const spec = config?.plugins?.installs?.[CHANNEL_ID]?.spec;
```

它读取 `spec` 的目的，不是单纯想知道“当前真实版本是多少”，而是想知道：

**当前这个插件被 OpenClaw 记录成了哪条安装轨道。**

例如：

- `@latest`
- `@compat-host-gte2026.3.0-lt2026.3.22`
- `@2.1.1`

这会影响后续判断：

- 如果已经是正确轨道，不用动
- 如果是错误轨道，要先卸载再重装
- 如果是固定 semver，说明用户可能手动锁版本，安装器就不强行升级

所以这里读 `spec` 是合理的，因为它关心的是“recorded install selector”，不是单纯关心 `version`。

## 16. 为什么错误轨道时要先卸载

因为 `openclaw plugins update <id>` 会复用当前记录下来的 install spec。

如果你现在记录的是：

```json
spec: "@tencent-weixin/openclaw-weixin@latest"
```

那后续 update 还会继续沿着 `latest` 走。

如果宿主版本变化后应该切到另一条兼容轨道，单纯 `update` 不够，得先清掉旧记录，再按新轨道重装。

所以这个安装器的逻辑是：

- 轨道错了
- 先卸载
- 再安装正确的 spec

## 17. 一个最简 mental model

可以把 OpenClaw 插件系统想成四层：

### 17.1 物理层

插件文件真的存在于：

- 扩展目录
- 或 `plugins.load.paths`

### 17.2 安装记录层

`plugins.installs`

记录：

- 从哪装的
- 用什么 spec 装的
- 装到哪
- 解析成了什么版本

### 17.3 配置层

`plugins.entries`

记录：

- 这个插件的 `enabled`
- 它的 `config`
- 其他运行配置

### 17.4 运行层

Gateway/loader 根据：

- 文件是否能被加载
- install/config 状态
- `enabled` 是否允许

最终决定插件是否参与运行。

## 18. 当前仓库里可直接对照的文件

- `tools/weixin-cli/cli.mjs`
  - 安装器主逻辑
- `tools/weixin-cli/lib/compat.mjs`
  - 兼容矩阵
- `tools/weixin-cli/lib/version-check.mjs`
  - 运行时宿主版本校验
- `scripts/verify-weixin-cli.sh`
  - 校验本地快照是否与 npm 上的安装器一致
- `.github/workflows/verify-weixin-cli.yml`
  - 自动跑上述校验的 CI

## 19. 后续继续读源码时建议先抓的几个问题

- `cli.mjs` 里每一步实际发出的 `openclaw` 命令是什么
- `compat.mjs` 里的区间判断是否会出现交叠或遗漏
- `version-check.mjs` 在插件本体里是如何被调用的
- OpenClaw 安装后实际写入 `openclaw.json` 的样子是什么
- `plugins.installs.spec` 与 `resolvedSpec` 在真实数据里的区别
