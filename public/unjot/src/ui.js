/* =========================================================================
   unjot · 主界面原型
   一个很小的状态机：
     theme(dark|light) · lang(zh|en) · size(normal|large) · shell(app|web)
     screen(conversation|start|recent|language|path|library|settings)
     tool(overview|rewrite|scenario|listening|explain|review) + toolsOpen
   切页只做三件事：换 active 类、写一个 data 属性、更新侧栏高亮。
   ========================================================================= */

/* 后端边界：会话、证据、设置、供应商表都来自 src/backend 与 src/model，
   这个文件只负责渲染与交互。 */
import { createChatSession } from "./chat-session.js";
import { createMockResponder } from "./mock-responses.js";
import { createSettingsService, createMemoryStore } from "./backend/settings-service.js";
import { PROVIDER_PRESETS } from "./model/entities.js";

const I18N = {
  zh: {
    "newChat": "新建对话",
    "nav.recent": "最近对话", "nav.language": "我的语言", "nav.path": "学习路径",
    "nav.tools": "工具", "nav.library": "资料库", "nav.settings": "设置",
    "nav.groupLearn": "学习", "nav.groupTools": "工具与资料",
    "userPlan": "免费版",
    "conv.title": "日常寒暄 · 在咖啡店点单", "conv.meta": "情境练习 · 难度 A2 · 第 3 轮",
    "conv.time": "上午 9:41",
    "conv.hint": "提示：点单时说 “Could I…” 更自然。", "conv.hint2": "试着用英语回答她。",
    "fb.title": "这句没错，这样说更自然",
    "fb.body": "把 “I want…” 换成 “Could I get…”，听起来更礼貌，也更像本地人。",
    "chip.explain": "解释一下", "chip.rewrite": "帮我改写",
    "chip.evidence": "已记录 · 独立使用 1 次", "chip.evidenceNone": "未记录证据",
    "chip.evidenceSpontaneous": "已记录 · 这次是你自己用的",
    "chip.evidenceAssisted": "已记录 · 这次借助了帮助",
    "chip.evidenceSupplied": "已记录 · 助手提供了这个表达",
    "chip.evidenceEncountered": "已记录 · 见过",
    "chip.evidenceNegative": "已记录 · 未构成产出",
    "note.supplied": "这个表达是助手提供的，不计入你的独立使用。",
    "note.negative": "只记为接触过，不构成正向产出。",
    "set.sound": "音效提示", "set.soundToggle": "开 / 关",
    "recent.empty": "还没有对话记录，说一句就开始了。",
    "recent.turns": "{n} 轮", "recent.active": "当前", "recent.kindScenario": "情境", "recent.kindChat": "对话",
    "time.justNow": "刚刚", "time.minutes": "{n} 分钟前", "time.hours": "{n} 小时前",
    "lang.empty": "还没有记录到任何表达。聊几句，只有你真正用过的才会被记下。",
    "lang.levelUnset": "未设置",
    "path.hintEmpty": "还没有这些场景的记录，随时可以点开这里练。",
    "path.hintSupplied": "有助手提供过的表达，还没有你自己的独立使用。",
    "path.hintEvidence": "已经有 {n} 次独立使用的记录。",
    "start.title": "想练点什么？", "start.sub": "选一个开始，或者直接在下面说英文。",
    "start.a": "情境练习", "start.aDesc": "咖啡店点单、面试、酒店入住",
    "start.b": "读一段文字", "start.bDesc": "贴一篇文章，边读边聊",
    "start.c": "练听力", "start.cDesc": "听一段对话，做理解练习",
    "start.tip": "不会写英文也没关系：用中文说你想要什么，AI 会帮你转成英文练习。",
    "recent.title": "最近对话", "recent.sub": "点一条就能接着聊。", "recent.search": "搜索",
    "recent.r1": "情境 · 8 轮 · 昨天", "recent.r2": "文章 · 12 轮 · 2 天前",
    "recent.r3": "情境 · 6 轮 · 3 天前", "recent.r4": "听力 · 5 轮 · 上周",
    "lang.title": "我的语言", "lang.sub": "AI 会按这里的设置调整说话难度。",
    "lang.native": "母语", "lang.target": "想练的语言", "lang.level": "当前水平",
    "lang.tip": "不确定自己的水平？聊几句之后，我们可以帮你判断。", "lang.adjust": "调整我的水平",
    "path.title": "学习路径", "path.sub": "按自己的节奏走，不用赶进度。",
    "path.s1": "第一阶段 · 敢开口", "path.s1d": "点单、问路、自我介绍这类日常场景。",
    "path.s2": "第二阶段 · 聊得下去", "path.s2d": "表达观点、描述经历、处理小问题。",
    "path.s3": "第三阶段 · 说得自然", "path.s3d": "语气、幽默、不同场合的说法。",
    "lib.title": "资料库", "lib.sub": "你读过、听过和收藏过的内容。",
    "lib.all": "全部", "lib.articles": "文章", "lib.audio": "音频", "lib.saved": "收藏",
    "lib.a": "文章 · 620 词 · B1", "lib.b": "文章 · 410 词 · A2",
    "lib.c": "音频 · 1:20 · A2", "lib.d": "收藏表达 · 来自「在咖啡店点单」",
    "set.title": "设置", "set.sub": "随时可以改，改完立即生效。",
    "set.ai": "AI 助手", "set.provider": "用哪个 AI", "set.local": "本地",
    "set.key": "连接状态", "set.keyOk": "已连接",
    "set.keyTip": "换 AI 或填自己的 API Key 都在这里，不影响已学的记录。",
    "set.learn": "学习偏好", "set.t1": "说错了帮我改", "set.t2": "先让我自己想，再给答案",
    "set.t3": "词汇难度跟着我的水平走", "set.look": "外观与语言",
    "set.accent": "主题色",
    "set.accentTip": "浅色界面用单色潘通粉，深色界面用酒红 + 暗夜紫；深色下也可以只取其中一色。",
    "set.theme": "主题", "set.dark": "深色", "set.light": "浅色",
    "set.lang": "界面语言", "set.size": "字大一点",
    "set.sizeNormal": "标准", "set.sizeLarge": "大字",
    "set.providers": "拿 Key 的入口",
    "set.providerCustom": "自定义供应商",
    "set.autoFilled": "已按所选供应商自动填入；选「自定义供应商」可以自己填。",
    "set.customFilled": "自己填接口地址：自建网关、公司内网或本地模型都可以，例如 https://api.example.com/v1",
    "set.keyNone": "未连接",
    "set.custom": "自定义空间",
    "set.baseUrl": "接口地址", "set.baseUrlPh": "https://api.example.com/v1",
    "set.model": "模型名", "set.modelPh": "gpt-4o-mini / qwen-plus / glm-4",
    "set.apiKey": "API Key", "set.apiKeyPh": "sk-…",
    "set.customTip": "自定义接口只存在本机，用于自建网关、公司内网或本地模型；不填就继续用上面的供应商。",
    "agent.title": "Agent 设定",
    "agent.name": "名字", "agent.namePh": "Unjot",
    "agent.lang": "讲解语言", "agent.langFollow": "跟界面",
    "agent.model": "使用模型", "agent.modelPh": "跟随上面的供应商",
    "agent.correction": "什么时候纠正我", "agent.corrOff": "不纠正", "agent.corrAsk": "我问了才说", "agent.corrAlways": "有更自然的就说",
    "agent.proactive": "主动程度", "agent.proOff": "只回应我", "agent.proAsk": "可以追问", "agent.proSuggest": "可以提议练习",
    "agent.memory": "记忆范围", "agent.memSession": "这次对话", "agent.memAll": "全部历史",
    "agent.level": "用语难度", "agent.levelFollow": "跟我的水平", "agent.levelSimple": "再简单一点", "agent.levelNatural": "自然就好",
    "agent.instructions": "角色设定",
    "agent.instructionsPh": "例如：先聊内容，遇到不清楚的地方再解释；不要替我做练习。",
    "agent.tools": "允许用的工具",
    "agent.note": "Agent 只影响怎么陪你聊；它不能改学习状态——证据和进度仍由程序按你的真实使用推导。",
    "composer.ph": "用英语说点什么…（也可以用中文）",
    "tools.cap": "挑一个工具，就在当前对话里开始。",
    "tool.rewrite": "改写", "tool.rewriteD": "换成你现在的水平能读懂的版本",
    "tool.scenario": "情境练习", "tool.scenarioD": "把想练的场景变成对话",
    "tool.listening": "听力", "tool.listeningD": "听一段对话，做理解练习",
    "tool.explain": "解释", "tool.explainD": "这句话什么意思、还能怎么说",
    "tool.review": "复习", "tool.reviewD": "在情境里再说一遍，而不是背单词",
    "rw.input": "贴一段文字，或者输入网址", "rw.run": "开始改写",
    "rw.progress": "进度", "rw.progressV": "已完成 6 / 8",
    "rw.s1": "读懂原文", "rw.s2": "找出超纲的词", "rw.s3": "对照你的水平",
    "rw.s4": "检查改写质量", "rw.s5": "输出结果",
    "rw.result": "改写结果", "rw.read": "读一遍", "rw.listen": "听一遍", "rw.talk": "聊一聊",
    "sc.templates": "常见场景", "sc.t1": "咖啡店点单", "sc.t2": "面试自我介绍", "sc.t3": "酒店入住",
    "sc.desc": "或者用一句话说你想练什么",
    "sc.sample": "我想练：在伦敦的咖啡店点一杯咖啡，顺便问有没有素食点心。",
    "sc.situation": "情境", "sc.situationV": "早上的伦敦咖啡店",
    "sc.you": "你的角色", "sc.youV": "顾客", "sc.ai": "AI 角色", "sc.aiV": "咖啡师",
    "sc.goal": "练习目标", "sc.goalV": "点单、礼貌提问", "sc.level": "难度",
    "sc.target": "会练到的表达", "sc.start": "开始练习",
    "ls.transcript": "文字稿", "ls.frozen": "已核对", "ls.q": "听懂了？选一个",
    "ls.o1": "她要问你要点什么", "ls.o2": "她问你要不要带走", "ls.evidence": "已记录 · 听力理解",
    "ex.selected": "你要问的这句", "ex.meaning": "意思", "ex.meaningV": "请给我一杯馥芮白",
    "ex.usage": "怎么用", "ex.alt": "也可以说", "ex.tone": "语气", "ex.toneV": "礼貌、日常",
    "ex.nuance": "细微差别", "ex.nuanceV": "比 “I want…” 更柔和", "ex.practice": "加入练习",
    "ex.empty": "解释功能暂未开放：词义与用法要等词条数据接入后再显示，这里先留空。",
    "rv.pool": "想在情境里再说一遍的",
    "rv.prompt": "用英语说说看",
    "rv.promptV": "你在伦敦的咖啡店，想点一杯拿铁，并问有没有燕麦奶。",
    "rv.noschedule": "这里不排复习时间表：不设到期日、不催你回来。想练时随时可以把一句表达放进情境里再说一遍，系统只记录你实际用过的证据。",
    "rv.submit": "提交", "rv.evidence": "已记录 · 主动表达",
    "demo.label": "演示开关", "demo.app": "应用窗口", "demo.web": "浏览器", "demo.start": "新对话",
    "accent.grad": "双色",
    "progress.note": "这里不设目标、不记连击、不给积分。有真实使用记录时，才用一句话说明学到哪一步。",
    "start.hello": "嗨，我是你的练习搭子",
    "start.helloSub": "说错了也没关系，我会接着聊。",
    "path.n1d": "已经能在这些场景里说出需要的句子。",
    "path.n2d": "正在练：把观点讲完，而不是只回答一句。",
    "path.n3d": "随时可以开始，没有解锁条件。",
    "path.note": "阶段只描述已经能做到什么，不设解锁条件，也不催进度。",
    "ls.tryHint": "点一下选项，马上看到反馈",
    "ls.speed": "播放速度",
    "ls.volume": "音量",
    "slider.a": "A · 细轨圆点",
    "slider.b": "B · 粗轨药丸",
    "quiz.good": "听懂了。",
    "quiz.bad": "再想想：她说的是 “what can I get for you”",
    "demo.prev": "上一版（简洁黑白）"
    , "demo.sound": "音效"
    , "demo.dots": "点阵背景"
  },
  en: {
    "newChat": "New conversation",
    "nav.recent": "Recent Conversations", "nav.language": "My Language", "nav.path": "Learning Path",
    "nav.tools": "Tools", "nav.library": "Library", "nav.settings": "Settings",
    "nav.groupLearn": "Learning", "nav.groupTools": "Tools & library",
    "userPlan": "Starter plan",
    "conv.title": "Small talk · Ordering coffee", "conv.meta": "Scenario · level A2 · turn 3",
    "conv.time": "9:41 AM",
    "conv.hint": "Tip: “Could I…” sounds more natural when ordering.", "conv.hint2": "Try answering her in English.",
    "fb.title": "Nothing wrong — this sounds more natural",
    "fb.body": "Swap “I want…” for “Could I get…” — it sounds politer and more native.",
    "chip.explain": "Explain it", "chip.rewrite": "Rewrite it",
    "chip.evidence": "Saved · used independently once", "chip.evidenceNone": "No evidence recorded",
    "chip.evidenceSpontaneous": "Saved · you produced this yourself",
    "chip.evidenceAssisted": "Saved · produced with help",
    "chip.evidenceSupplied": "Saved · supplied by the assistant",
    "chip.evidenceEncountered": "Saved · encountered",
    "chip.evidenceNegative": "Saved · no production credit",
    "note.supplied": "The assistant supplied this one, so it is not counted as your independent use.",
    "note.negative": "Recorded as exposure only; it earns no production credit.",
    "set.sound": "Sound cues", "set.soundToggle": "On / off",
    "recent.empty": "No conversations yet — send one message to start.",
    "recent.turns": "{n} turns", "recent.active": "Current", "recent.kindScenario": "Scenario", "recent.kindChat": "Chat",
    "time.justNow": "just now", "time.minutes": "{n} min ago", "time.hours": "{n} h ago",
    "lang.empty": "No expressions recorded yet — chat a little; only real use is recorded.",
    "lang.levelUnset": "Not set",
    "path.hintEmpty": "Nothing recorded here yet — open this stage whenever you want to practise.",
    "path.hintSupplied": "The assistant has supplied expressions here; no independent use yet.",
    "path.hintEvidence": "{n} independent uses recorded.",
    "start.title": "What would you like to practise?",
    "start.sub": "Pick one to start, or just type in English below.",
    "start.a": "Scenario practice", "start.aDesc": "Café ordering, interviews, hotel check-in",
    "start.b": "Read something", "start.bDesc": "Paste a text and talk it through",
    "start.c": "Listening", "start.cDesc": "Hear a dialogue, then check comprehension",
    "start.tip": "You don’t have to write English: say what you want in Chinese and AI turns it into practice.",
    "recent.title": "Recent Conversations", "recent.sub": "Tap one to carry on.", "recent.search": "Search",
    "recent.r1": "Scenario · 8 turns · yesterday", "recent.r2": "Article · 12 turns · 2 days ago",
    "recent.r3": "Scenario · 6 turns · 3 days ago", "recent.r4": "Listening · 5 turns · last week",
    "lang.title": "My Language", "lang.sub": "AI adjusts its language to these settings.",
    "lang.native": "Native language", "lang.target": "Practising", "lang.level": "Current level",
    "lang.tip": "Not sure about your level? Chat a little and we’ll help you work it out.",
    "lang.adjust": "Adjust my level",
    "path.title": "Learning Path", "path.sub": "Go at your own pace — no streaks to chase.",
    "path.s1": "Stage 1 · Start speaking", "path.s1d": "Ordering, directions, introducing yourself.",
    "path.s2": "Stage 2 · Keep it going", "path.s2d": "Opinions, stories, handling small problems.",
    "path.s3": "Stage 3 · Sound natural", "path.s3d": "Tone, humour, register for different settings.",
    "lib.title": "Library", "lib.sub": "What you’ve read, heard and saved.",
    "lib.all": "All", "lib.articles": "Articles", "lib.audio": "Audio", "lib.saved": "Saved",
    "lib.a": "Article · 620 words · B1", "lib.b": "Article · 410 words · A2",
    "lib.c": "Audio · 1:20 · A2", "lib.d": "Saved phrase · from “Ordering coffee”",
    "set.title": "Settings", "set.sub": "Change anything any time — it takes effect right away.",
    "set.ai": "AI assistant", "set.provider": "Which AI", "set.local": "Local",
    "set.key": "Connection", "set.keyOk": "Connected",
    "set.keyTip": "Switching AI or adding your own API key happens here, without touching your learning record.",
    "set.learn": "Learning preferences", "set.t1": "Correct me when I get it wrong",
    "set.t2": "Let me think first, then show the answer", "set.t3": "Keep vocabulary at my level",
    "set.look": "Appearance & language",
    "set.accent": "Second colour",
    "set.accentTip": "Light UI uses a single Pantone pink; dark UI uses wine red + night purple, and you can take just one of them.",
    "set.theme": "Theme", "set.dark": "Dark", "set.light": "Light",
    "set.lang": "Interface language", "set.size": "Text size",
    "set.sizeNormal": "Default", "set.sizeLarge": "Large",
    "set.providers": "Where to get a key",
    "set.providerCustom": "Custom provider",
    "set.autoFilled": "Filled in from the provider you picked. Choose “Custom provider” to type your own.",
    "set.customFilled": "Type your own endpoint: your own gateway, an intranet service, or a local model — e.g. https://api.example.com/v1",
    "set.keyNone": "Not connected",
    "set.custom": "Custom space",
    "set.baseUrl": "Base URL", "set.baseUrlPh": "https://api.example.com/v1",
    "set.model": "Model", "set.modelPh": "gpt-4o-mini / qwen-plus / glm-4",
    "set.apiKey": "API key", "set.apiKeyPh": "sk-…",
    "set.customTip": "A custom endpoint stays on this machine — for your own gateway, an intranet service, or a local model. Leave it empty to keep using the providers above.",
    "agent.title": "Agent setup",
    "agent.name": "Name", "agent.namePh": "Unjot",
    "agent.lang": "Explanation language", "agent.langFollow": "Follow UI",
    "agent.model": "Model", "agent.modelPh": "Follow the provider above",
    "agent.correction": "When to correct me", "agent.corrOff": "Never", "agent.corrAsk": "Only when I ask", "agent.corrAlways": "Whenever there is a more natural way",
    "agent.proactive": "How proactive", "agent.proOff": "Only respond to me", "agent.proAsk": "May ask follow-ups", "agent.proSuggest": "May suggest practice",
    "agent.memory": "Memory scope", "agent.memSession": "This conversation", "agent.memAll": "All history",
    "agent.level": "Language level", "agent.levelFollow": "Follow my level", "agent.levelSimple": "Keep it simpler", "agent.levelNatural": "Natural is fine",
    "agent.instructions": "Instructions",
    "agent.instructionsPh": "For example: keep talking about the topic; explain only when something is unclear; don't do the practice for me.",
    "agent.tools": "Allowed tools",
    "agent.note": "The agent only shapes how it talks with you. It cannot change learning state — evidence and progress stay derived by the program from real use.",
    "composer.ph": "Say something in English… (Chinese is fine too)",
    "tools.cap": "Pick a tool and start inside this conversation.",
    "tool.rewrite": "Rewrite", "tool.rewriteD": "Turn it into a version you can read now",
    "tool.scenario": "Scenario", "tool.scenarioD": "Turn a situation into a dialogue",
    "tool.listening": "Listening", "tool.listeningD": "Hear a dialogue, then check comprehension",
    "tool.explain": "Explain", "tool.explainD": "What it means and what else you could say",
    "tool.review": "Review", "tool.reviewD": "Say it again in context — not flashcards",
    "rw.input": "Paste text, or enter a URL", "rw.run": "Start rewriting",
    "rw.progress": "Progress", "rw.progressV": "6 of 8 done",
    "rw.s1": "Understand the original", "rw.s2": "Find words above your level", "rw.s3": "Compare with your level",
    "rw.s4": "Check the rewrite quality", "rw.s5": "Output the result",
    "rw.result": "Rewritten", "rw.read": "Read it", "rw.listen": "Listen", "rw.talk": "Discuss",
    "sc.templates": "Common situations", "sc.t1": "Ordering coffee", "sc.t2": "Job interview intro", "sc.t3": "Hotel check-in",
    "sc.desc": "Or describe what you want to practise in one line",
    "sc.sample": "I want to practise ordering coffee in a London café and asking about vegan pastries.",
    "sc.situation": "Situation", "sc.situationV": "A London café in the morning",
    "sc.you": "Your role", "sc.youV": "Customer", "sc.ai": "AI role", "sc.aiV": "Barista",
    "sc.goal": "Goal", "sc.goalV": "Order and ask politely", "sc.level": "Difficulty",
    "sc.target": "Language you’ll practise", "sc.start": "Start practising",
    "ls.transcript": "Transcript", "ls.frozen": "Verified", "ls.q": "Got it? Pick one",
    "ls.o1": "What she can get for you", "ls.o2": "Whether you want it to go",
    "ls.evidence": "Saved · listening",
    "ex.selected": "The sentence", "ex.meaning": "Meaning", "ex.meaningV": "One flat white, please",
    "ex.usage": "Pattern", "ex.alt": "You could also say", "ex.tone": "Tone", "ex.toneV": "Polite, everyday",
    "ex.nuance": "Nuance", "ex.nuanceV": "Softer than “I want…”", "ex.practice": "Add to practice",
    "ex.empty": "Explain isn't available yet: meaning, usage and alternatives stay empty until lexical data is connected.",
    "rv.pool": "Worth saying again in context",
    "rv.prompt": "Say it in English",
    "rv.promptV": "You’re in a London café. Order a latte and ask if they have oat milk.",
    "rv.noschedule": "There is no review schedule here: no due dates, no nudges. Say a phrase again in a situation whenever you feel like it — only real use gets recorded.",
    "rv.submit": "Submit", "rv.evidence": "Saved · active recall",
    "demo.label": "Demo switches", "demo.app": "App window", "demo.web": "Browser", "demo.start": "New chat",
    "accent.grad": "Both",
    "progress.note": "No targets, no streaks, no points. Progress is one sentence of evidence, and only when there is real use to report.",
    "start.hello": "Hi — I'm your practice buddy",
    "start.helloSub": "Mistakes are fine, I'll keep the conversation going.",
    "path.n1d": "You can already say what you need in these situations.",
    "path.n2d": "Working on finishing a thought, not just answering in one line.",
    "path.n3d": "Open whenever you want — nothing to unlock.",
    "path.note": "Stages only describe what you can already do. Nothing is locked, and nothing chases you.",
    "ls.tryHint": "Tap an option to see feedback",
    "ls.speed": "Playback speed",
    "ls.volume": "Volume",
    "slider.a": "A · thin track",
    "slider.b": "B · chunky track",
    "quiz.good": "Got it.",
    "quiz.bad": "Not quite — she asked “what can I get for you”",
    "demo.prev": "Previous version (mono)"
    , "demo.sound": "Sound"
    , "demo.dots": "Dot grid"
  }
};

/* 第二主题色的名字随主题变化 */
const ACCENT_NAMES = {
  light: { zh: ["潘通粉", "潘通粉"], en: ["Pantone pink", "Pantone pink"] },
  dark: { zh: ["酒红", "暗夜紫"], en: ["Wine red", "Night purple"] }
};

const TOOL_TITLES = { overview: "Tools", rewrite: "Rewrite", scenario: "Scenario", listening: "Listening", explain: "Explain", review: "Review" };
const TOOL_BADGES = {
  rewrite: { zh: "改写", en: "Rewrite" },
  scenario: { zh: "情境", en: "Scenario" },
  listening: { zh: "听力", en: "Listening" },
  explain: { zh: "解释", en: "Explain" },
  review: { zh: "复习", en: "Review" }
};

const state = {
  theme: "dark", lang: "zh", size: "normal", shell: "app", accent: "grad",
  screen: "conversation", tool: "overview", toolsOpen: false,
  sound: false, dots: true
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const root = document.documentElement;

/* ------------------------------ 后端服务 ------------------------------ */
const settingsService = createSettingsService({ store: createMemoryStore() });
const chat = createChatSession({
  respond: createMockResponder({ delayMs: 260 }),
  contextId: "ctx:cafe-1",
});
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const t = (k) => (I18N[state.lang] || I18N.zh)[k] ?? I18N.zh[k] ?? k;

/* ------------------------------- 文案 ------------------------------- */
function applyText() {
  $$("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  $$("[data-i18n-ph]").forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  const names = (ACCENT_NAMES[state.theme] || ACCENT_NAMES.dark)[state.lang] || ACCENT_NAMES.dark.zh;
  $$("[data-accent-set]").forEach(b => {
    if (b.dataset.accentSet === "one") b.textContent = names[0];
    else if (b.dataset.accentSet === "two") b.textContent = names[1];
  });
  $("#toolsTitle").textContent = TOOL_TITLES[state.tool];
  const badge = TOOL_BADGES[state.tool];
  const badgeEl = $("#toolsBadge");
  badgeEl.hidden = !badge;
  if (badge) badgeEl.textContent = badge[state.lang];
  // 供应商的提示行与连接状态是动态文案，语言切换后按当前模式重算
  if ($("#aiProvider")) renderAiConfig();
}

function syncSegs() {
  $$("[data-theme-set]").forEach(b => b.classList.toggle("is-on", b.dataset.themeSet === state.theme));
  $$("[data-lang-set]").forEach(b => b.classList.toggle("is-on", b.dataset.langSet === state.lang));
  $$("[data-size-set]").forEach(b => b.classList.toggle("is-on", b.dataset.sizeSet === state.size));
  $$("[data-shell-set]").forEach(b => b.classList.toggle("is-on", b.dataset.shellSet === state.shell));
  $$("[data-accent-set]").forEach(b => b.classList.toggle("is-on", b.dataset.accentSet === state.accent));
}

function syncNav() {
  $$(".nav-item").forEach(item => {
    const active = (item.dataset.go && item.dataset.go === state.screen) ||
                   (item.dataset.tools && state.toolsOpen);
    item.classList.toggle("is-active", !!active);
  });
}

/* ------------------------------ 切页 ------------------------------ */
/* 交叉淡入淡出只用 transition（可被打断、可重定向）：
   进场 = 加 is-active；退场 = 去掉 is-active + 用 is-leaving 保持可见直到过渡结束 */
function go(name) {
  if (!name || name === state.screen) return;
  const next = $(`.screen[data-screen="${name}"]`);
  if (!next) return;
  const prev = $(".screen.is-active");

  state.screen = name;
  root.dataset.screen = name;
  // 工具窗是「对话内」的面板：切到列表/设置类页面时自动收起
  if (state.toolsOpen && name !== "conversation" && name !== "start") {
    state.toolsOpen = false;
    applyTools();
  }

  const urls = {
    conversation: "app.unjot.local/conversation",
    start: "app.unjot.local/new",
    recent: "app.unjot.local/recent",
    language: "app.unjot.local/language",
    path: "app.unjot.local/path",
    library: "app.unjot.local/library",
    settings: "app.unjot.local/settings"
  };
  $("#urlText").textContent = urls[name] || urls.conversation;

  if (prev === next) { syncNav(); return; }

  if (prev) {
    prev.classList.remove("is-active");
    if (!reduceMotion) {
      prev.classList.add("is-leaving");
      const done = () => prev.classList.remove("is-leaving");
      prev.addEventListener("transitionend", done, { once: true });
      setTimeout(done, 320);
    }
  }

  next.classList.add("is-active");
  syncNav();
}

/* ------------------------------ Tools ------------------------------ */
function applyTools() {
  const el = $("#tools");
  el.classList.toggle("is-open", state.toolsOpen);
  el.setAttribute("aria-hidden", String(!state.toolsOpen));
  $("#fab").hidden = state.toolsOpen;
  $$(".panel").forEach(p => p.classList.toggle("is-on", p.dataset.panel === state.tool));
  applyText();
  syncNav();
}
/* 弹层从触发它的那个控件位置展开，而不是从中心。
   注意：触发控件可能在打开的同时被隐藏（如 FAB），所以先量位置、切完状态再算原点。 */
let pendingOrigin = null;
function rememberOrigin(trigger) {
  if (!trigger) { pendingOrigin = null; return; }
  const r = trigger.getBoundingClientRect();
  pendingOrigin = (r.width && r.height) ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
}
function applyOrigin() {
  const win = $("#tools");
  if (!win) return;
  if (!pendingOrigin) { win.style.removeProperty("--transform-origin"); return; }
  const w = win.getBoundingClientRect();
  if (!w.width || !w.height) { win.style.removeProperty("--transform-origin"); return; }
  const ox = Math.min(Math.max(pendingOrigin.x - w.left, 16), w.width - 16);
  const oy = Math.min(Math.max(pendingOrigin.y - w.top, 16), w.height - 16);
  win.style.setProperty("--transform-origin", ox.toFixed(0) + "px " + oy.toFixed(0) + "px");
}

function openTool(name, trigger) {
  if (name) state.tool = name;
  rememberOrigin(trigger);
  state.toolsOpen = true;
  applyTools();
  applyOrigin();
}
function toggleTools(trigger) {
  if (!state.toolsOpen) rememberOrigin(trigger);
  state.toolsOpen = !state.toolsOpen;
  applyTools();
  if (state.toolsOpen) applyOrigin();
}

/* ------------------------------ 外观 ------------------------------ */
function setTheme(v) {
  state.theme = v;
  root.dataset.theme = v;
  // 浅色只有单色潘通粉：把深色下的"双色"收回来，避免出现没有选中项的按钮组
  if (v === "light" && state.accent !== "one") state.accent = "one";
  root.dataset.accent = state.accent;
  applyText();
  syncSegs();
}
function setAccent(v) { state.accent = v; root.dataset.accent = v; syncSegs(); }
function setLang(v) { state.lang = v; root.dataset.lang = v; root.lang = v === "zh" ? "zh-CN" : "en"; applyText(); syncSegs(); }
function setSize(v) { state.size = v; root.dataset.size = v; syncSegs(); }
function setShell(v) { state.shell = v; root.dataset.shell = v; syncSegs(); }

/* ------------------------------ AI 供应商 ------------------------------ */
/* 选项由后端模型层的 PROVIDER_PRESETS 生成；选中即由 settings-service 自动补齐
   Base URL 与默认模型并把字段转为只读，选「自定义供应商」时交回用户填写。
   API Key 本身不进入配置，只写入一条"密钥库引用"。 */
function refreshAiStatus() {
  const boxEl = $("#aiStatus");
  const textEl = $("#aiStatusText");
  if (!boxEl || !textEl) return;
  const snapshot = settingsService.getSnapshot();
  const connected = snapshot.keyRef !== null && ($("#aiKey")?.value.trim().length ?? 0) >= 8;
  boxEl.classList.toggle("is-ok", connected);
  textEl.textContent = t(connected ? "set.keyOk" : "set.keyNone");
}

/** 自定义模式下用户还没填完的草稿；填完整后由 settings-service 落库 */
let customDraft = null;

/** 把服务里的配置渲染回表单 */
function renderAiConfig() {
  const snapshot = settingsService.getSnapshot();
  const custom = customDraft !== null || snapshot.provider === "custom";
  const base = customDraft === null ? (snapshot.baseUrl ?? "") : customDraft.baseUrl;
  const model = customDraft === null ? (snapshot.model ?? "") : customDraft.model;
  const select = $("#aiProvider");
  if (select) select.value = custom ? "custom" : snapshot.provider;
  const baseEl = $("#aiBaseUrl");
  const modelEl = $("#aiModel");
  if (baseEl) {
    baseEl.value = base;
    baseEl.readOnly = !custom;
    baseEl.placeholder = custom ? "https://api.example.com/v1" : "";
  }
  if (modelEl) {
    modelEl.value = model;
    modelEl.readOnly = !custom;
    modelEl.placeholder = custom ? "gpt-4o-mini / qwen-plus / glm-4" : "";
  }
  const hint = $("#aiUrlHint");
  if (hint) {
    hint.dataset.mode = custom ? "custom" : "auto";
    hint.textContent = t(custom ? "set.customFilled" : "set.autoFilled");
  }
  refreshAiStatus();
}

/** 供应商下拉与 Agent 字段都从服务状态渲染，避免界面自己维护一份表 */
function bootstrapSettingsForm() {
  const select = $("#aiProvider");
  if (select) {
    const options = PROVIDER_PRESETS.map((preset) => new Option(preset.label, preset.id));
    options.push(new Option(t("set.providerCustom"), "custom"));
    select.replaceChildren(...options);
  }
  renderAiConfig();
  applyAgentToForm();
}

function applyAgentToForm() {
  const agent = settingsService.getSnapshot().agent;
  const setValue = (selector, value) => {
    const el = $(selector);
    if (el) el.value = value ?? "";
  };
  setValue("#agentName", agent.name);
  setValue("#agentModel", agent.model ?? "");
  setValue("#agentInstructions", agent.instructions ?? "");

  $$("[data-setting]").forEach((group) => {
    const key = group.dataset.setting.replace("agent.", "");
    group.querySelectorAll(".seg-btn").forEach((btn) => btn.classList.toggle("is-on", btn.dataset.value === agent[key]));
  });
  $$("[data-setting-multi]").forEach((group) => {
    const key = group.dataset.settingMulti.replace("agent.", "");
    const chosen = agent[key] ?? [];
    group.querySelectorAll(".seg-btn").forEach((btn) => btn.classList.toggle("is-on", chosen.includes(btn.dataset.value)));
  });
}

function saveAgentPatch(patch) {
  try {
    settingsService.setAgent(patch);
  } catch (error) {
    // 模型层拒绝的值不写进配置；原型里只可能来自界面自身的改动
    console.warn("agent setting rejected:", error.message);
  }
  applyAgentToForm();
}

function saveApiKeyRef() {
  const snapshot = settingsService.getSnapshot();
  const entered = ($("#aiKey")?.value.trim().length ?? 0) >= 8;
  try {
    settingsService.setApiKeyRef(entered ? `browser-secure-store:${snapshot.provider}` : null);
  } catch (error) {
    console.warn("key reference rejected:", error.message);
  }
  refreshAiStatus();
}

/* ------------------------------ 事件 ------------------------------ */
/* ---- 理解反馈：只说明对错，不给积分、不庆祝、不记连击 ---- */
function answerQuiz(opt) {
  const group = opt.closest(".mini") || opt.parentElement;
  const opts = $$(".opt[data-answer]", group);
  opts.forEach(o => o.classList.remove("right", "wrong"));
  const good = opt.dataset.answer === "correct";
  opt.classList.add(good ? "right" : "wrong");
  if (!good) {
    const c = opts.find(o => o.dataset.answer === "correct");
    if (c) c.classList.add("right");
  }
  $$(".quiz-fb", group).forEach(n => n.remove());
  const fb = document.createElement("div");
  fb.className = "quiz-fb " + (good ? "good" : "bad");
  fb.textContent = good ? t("quiz.good") : t("quiz.bad");
  const hint = $(".quiz-hint", group);
  group.insertBefore(fb, hint || null);
  blip(good ? 660 : 220, 0.06);
  haptic(good ? 8 : 4);
}

/* ============ §2 §3 §5 §6 §9 §10：工具小窗可拖拽关闭 ============ */
const DRAG = { active: false, moved: false, id: null, startX: 0, startY: 0, x: 0, y: 0, history: [] };

/* §9 软边界：越界越难拖 */
function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
/* §6 动量投影：Apple 的指数衰减写法，不是 v²/(2a) */
function project(v, deceleration = 0.998) {
  return (v / 1000) * deceleration / (1 - deceleration);
}
function releaseVelocity() {
  const h = DRAG.history;
  if (h.length < 2) return { vx: 0, vy: 0 };
  const a = h[0], b = h[h.length - 1];
  const dt = Math.max(16, b.t - a.t) / 1000;
  return { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt };
}

function onDragStart(e) {
  const el = $("#tools");
  if (!el.classList.contains("is-open") || DRAG.active) return;
  if (e.pointerType === "mouse" && e.button !== 0) return;
  // §3 永远从「当前呈现值」接管：回弹途中再次抓住也不会跳
  const m = getComputedStyle(el).transform;
  if (m && m !== "none") {
    const nums = m.match(/-?\d+\.?\d*/g);
    if (nums && nums.length >= 6) { DRAG.x = parseFloat(nums[4]) || 0; DRAG.y = parseFloat(nums[5]) || 0; }
  }
  DRAG.active = true; DRAG.moved = false; DRAG.id = e.pointerId;
  DRAG.startX = e.clientX - DRAG.x;
  DRAG.startY = e.clientY - DRAG.y;
  DRAG.history = [{ t: performance.now(), x: e.clientX, y: e.clientY }];
  try { el.setPointerCapture(e.pointerId); } catch (err) {}
  el.classList.add("is-settling");      // §11 即将运动，提前提示合成
}

function onDragMove(e) {
  if (!DRAG.active || e.pointerId !== DRAG.id) return;
  const el = $("#tools");
  const rawX = e.clientX - DRAG.startX;
  const rawY = e.clientY - DRAG.startY;
  if (!DRAG.moved) {
    if (Math.hypot(rawX, rawY) < 10) return;   // §10 10px 迟滞，先判定意图
    DRAG.moved = true;
    el.classList.add("is-dragging");           // 拖拽期间移除过渡 → 1:1 跟手
  }
  const w = el.offsetWidth || 380, h = el.offsetHeight || 520;
  DRAG.x = rawX > 0 ? rawX : rubberband(rawX, w);
  DRAG.y = rawY > 0 ? rawY : rubberband(rawY, h);
  el.style.transform = "translate3d(" + DRAG.x + "px," + DRAG.y + "px,0)";
  DRAG.history.push({ t: performance.now(), x: e.clientX, y: e.clientY });
  if (DRAG.history.length > 6) DRAG.history.shift();
  if (e.cancelable) e.preventDefault();
}

function onDragEnd(e) {
  if (!DRAG.active || (e.pointerId !== undefined && e.pointerId !== DRAG.id)) return;
  const el = $("#tools");
  DRAG.active = false;
  try { el.releasePointerCapture(DRAG.id); } catch (err) {}
  el.classList.remove("is-dragging");
  if (!DRAG.moved) { el.style.transform = ""; el.classList.remove("is-settling"); return; }

  const { vx, vy } = releaseVelocity();
  const w = el.offsetWidth || 380, h = el.offsetHeight || 520;
  const px = DRAG.x + project(vx);
  const py = DRAG.y + project(vy);
  // Quick Reference：回弹还是关闭，用速度方向判断，而不是位置
  const dismiss = px > w * 0.35 || py > h * 0.3 || vx > 700 || vy > 700;
  el.classList.remove("is-settling");

  if (dismiss) {
    el.style.transform = "translate3d(" + (w + 140) + "px," + (Math.max(0, py) + 80) + "px,0)";
    blip(320, 0.05);
    haptic(6);
    setTimeout(() => {
      el.style.transform = "";
      el.style.removeProperty("--transform-origin");
      state.toolsOpen = false;
      applyTools();
      DRAG.x = 0; DRAG.y = 0;
    }, 420);
  } else {
    // §5 速度交接：回弹用默认弹簧，不带过冲
    el.style.transform = "translate3d(0,0,0)";
    setTimeout(() => { el.style.transform = ""; DRAG.x = 0; DRAG.y = 0; }, 640);
  }
}

(() => {
  const head = $(".tools-head");
  if (!head) return;
  head.addEventListener("pointerdown", onDragStart);
  window.addEventListener("pointermove", onDragMove, { passive: false });
  window.addEventListener("pointerup", onDragEnd);
  window.addEventListener("pointercancel", onDragEnd);
})();

document.addEventListener("click", ev => {
  const opt = ev.target.closest(".opt[data-answer]");
  if (opt) return answerQuiz(opt);
  const el = ev.target.closest("[data-go],[data-tool-open],[data-tools],[data-theme-set],[data-lang-set],[data-size-set],[data-shell-set],[data-accent-set],[data-sound],[data-dots]");
  if (!el) return;
  if (el.dataset.dots !== undefined) {
    state.dots = !state.dots;
    el.classList.toggle("is-on", state.dots);
    DOTS.enabled = state.dots;
    if (!state.dots) {
      DOTS.cv.style.visibility = "hidden";
      if (DOTS.raf) cancelAnimationFrame(DOTS.raf);
      DOTS.raf = 0;
      // 复位，免得再次打开时点从旧位置"跳"回来
      for (const d of DOTS.grid) { d.ox = 0; d.oy = 0; d.vx = 0; d.vy = 0; d.a = 0; }
    }
    else { DOTS.cv.style.visibility = ""; dotsKick(); }
    return;
  }
  if (el.dataset.sound !== undefined) {
    state.sound = !state.sound;
    el.classList.toggle("is-on", state.sound);
    if (state.sound) { blip(560, 0.04); haptic(6); }
    return;
  }
  if (el.dataset.go) return go(el.dataset.go);
  if (el.dataset.toolOpen) return openTool(el.dataset.toolOpen, el);
  if (el.dataset.tools) return toggleTools(el);
  if (el.dataset.themeSet) return setTheme(el.dataset.themeSet);
  if (el.dataset.langSet) return setLang(el.dataset.langSet);
  if (el.dataset.sizeSet) return setSize(el.dataset.sizeSet);
  if (el.dataset.shellSet) return setShell(el.dataset.shellSet);
  if (el.dataset.accentSet) return setAccent(el.dataset.accentSet);
});

document.addEventListener("keydown", ev => {
  if (ev.key === "Escape" && state.toolsOpen) { state.toolsOpen = false; applyTools(); }
});

$("#toolsClose").addEventListener("click", () => { state.toolsOpen = false; applyTools(); });
$("#fab").addEventListener("click", () => openTool(null, $("#fab")));
$("#newChat").addEventListener("click", () => go("start"));
// 演示条已移除；下面这些开关现在都在「设置 → 外观与语言」里

/* AI 供应商：切换即自动补齐 Base URL 与模型；填了 Key 才算连上 */
if ($("#aiProvider")) {
  $("#aiProvider").addEventListener("change", (ev) => {
    const id = ev.target.value;
    if (id === "custom") {
      customDraft = { baseUrl: "", model: "" };
    } else {
      customDraft = null;
      settingsService.selectProvider(id);
    }
    renderAiConfig();
  });
  // 自定义模式下 Base URL / 模型由用户填写，服务层负责校验（必须是绝对 http(s) URL）
  for (const selector of ["#aiBaseUrl", "#aiModel"]) {
    $(selector).addEventListener("input", () => {
      if (customDraft === null && settingsService.getSnapshot().provider !== "custom") return;
      customDraft = { baseUrl: $("#aiBaseUrl").value, model: $("#aiModel").value };
      try {
        settingsService.setCustomProvider({ baseUrl: customDraft.baseUrl, model: customDraft.model || null });
        customDraft = null; // 已落库，之后按服务状态渲染
      } catch {
        /* 输入过程中的半成品不报错，等填完整再落库 */
      }
      const hint = $("#aiUrlHint");
      if (hint) {
        hint.dataset.mode = "custom";
        hint.textContent = t("set.customFilled");
      }
      refreshAiStatus();
    });
  }
  $("#aiKey").addEventListener("input", saveApiKeyRef);
  bootstrapSettingsForm();
}

/* Agent 字段：改动直接交给 settings-service 校验后写入配置 */
for (const [selector, key] of [["#agentName", "name"], ["#agentModel", "model"], ["#agentInstructions", "instructions"]]) {
  const el = $(selector);
  if (el) el.addEventListener("input", () => saveAgentPatch({ [key]: el.value }));
}

document.addEventListener("click", (ev) => {
  const single = ev.target.closest("[data-setting] .seg-btn");
  if (single) {
    const group = single.closest("[data-setting]");
    saveAgentPatch({ [group.dataset.setting.replace("agent.", "")]: single.dataset.value });
    return;
  }
  const multi = ev.target.closest("[data-setting-multi] .seg-btn");
  if (multi && !multi.disabled) {
    const group = multi.closest("[data-setting-multi]");
    const key = group.dataset.settingMulti.replace("agent.", "");
    const chosen = new Set(settingsService.getSnapshot().agent[key] ?? []);
    if (chosen.has(multi.dataset.value)) chosen.delete(multi.dataset.value);
    else chosen.add(multi.dataset.value);
    saveAgentPatch({ [key]: [...chosen] });
  }
});

/* ------------------------------ 输入 ------------------------------ */
function scrollStream() {
  const s = $("#stream");
  s.scrollTop = s.scrollHeight;
}
function appendUser(text) {
  const wrap = document.createElement("div");
  wrap.className = "msg user";
  const bubble = document.createElement("div");
  bubble.className = "bubble txt-orig";
  bubble.textContent = text;
  const av = document.createElement("div");
  av.className = "avatar-sm";
  av.textContent = "sy";
  wrap.appendChild(av);
  wrap.appendChild(bubble);
  $("#stream").appendChild(wrap);
  scrollStream();
}
/* ---- 会话渲染：轮次与证据都来自后端服务，界面不自己编消息 ---- */
function itemLabel(itemId) {
  return itemId.replace(/^sense:/, "").replace(/%2.*$/, "").replace(/_/g, " ");
}

/** 证据条说的是"这一轮记下了什么"，不是累计进度（累计进度见 progress.sentence） */
function evidenceLabel(observation) {
  if (!observation) return t("chip.evidenceNone");
  switch (observation.kind) {
    case "spontaneous_production": return t("chip.evidenceSpontaneous");
    case "assisted_production": return t("chip.evidenceAssisted");
    case "supplied": return t("chip.evidenceSupplied");
    case "encountered": return t("chip.evidenceEncountered");
    default: return t("chip.evidenceNegative");
  }
}

/** 累计状态句只在有真实产出时显示；助手提供/接触类给出原因说明 */
function evidenceNote(observation, progress) {
  if (!observation) return null;
  if (observation.kind === "spontaneous_production" || observation.kind === "assisted_production") {
    return progress ? progress.sentence : null;
  }
  if (observation.kind === "supplied") return t("note.supplied");
  return t("note.negative");
}

/** @param {Element} host @param {string | null} text */
function appendEvidenceLine(host, text) {
  if (!text) return;
  const line = document.createElement("p");
  line.className = "evidence-line";
  line.textContent = text;
  host.appendChild(line);
}

function appendCorrectionCard(turn, observation, progress) {
  const card = document.createElement("div");
  card.className = "card feedback";
  card.innerHTML =
    '<div class="card-head"><svg class="ic ok"><use href="#i-check"/></svg><span></span></div>' +
    '<p class="quote txt-ex"></p>' +
    '<div class="chips">' +
    '<button class="chip" data-tool-open="explain"></button>' +
    '<button class="chip" data-tool-open="rewrite"></button>' +
    '<span class="chip quiet"></span>' +
    "</div>";
  card.querySelector(".card-head span").textContent = t("fb.title");
  card.querySelector(".quote").textContent = turn.correction.text;
  const chips = card.querySelectorAll(".chips button.chip");
  chips[0].textContent = t("chip.explain");
  chips[1].textContent = t("chip.rewrite");
  card.querySelector(".chip.quiet").textContent = evidenceLabel(observation);
  appendEvidenceLine(card, evidenceNote(observation, progress));
  $("#stream").appendChild(card);
}

function appendAi(turn, observation, progress) {
  const wrap = document.createElement("div");
  wrap.className = "msg ai";
  wrap.innerHTML =
    '<div class="avatar-sm ai">un</div>' +
    '<div class="bubble txt-orig"><p></p></div>';
  wrap.querySelector("p").textContent = turn.text;
  $("#stream").appendChild(wrap);
  if (turn.correction) appendCorrectionCard(turn, observation, progress);
  else appendEvidenceLine($("#stream"), evidenceNote(observation, progress));
  scrollStream();
}

/** 清掉开场白之后的动态内容，再按后端状态重画 */
function renderStream() {
  const snapshot = chat.getState();
  const stream = $("#stream");
  const anchor = $("#scenario-opener");
  [...stream.children].forEach((node) => {
    if (node === anchor) return;
    if (node.classList && node.classList.contains("time-chip")) return;
    node.remove();
  });

  snapshot.turns.forEach((turn, index) => {
    if (turn.role === "learner") {
      appendUser(turn.text);
      return;
    }
    const learnerTurn = snapshot.turns[index - 1];
    const observation = snapshot.observations.find((event) => event.turnId === learnerTurn?.id);
    const progress = observation ? chat.getProgress(observation.itemId, { label: itemLabel(observation.itemId) }) : null;
    appendAi(turn, observation, progress);
  });

  if (snapshot.busy) appendTyping();
}

/* §1：发送后立刻出现的输入指示器，替换掉「等 400ms 才给反馈」 */
function appendTyping() {
  const wrap = document.createElement("div");
  wrap.className = "msg ai";
  wrap.innerHTML =
    '<div class="avatar-sm ai">un</div>' +
    '<div class="bubble"><span class="typing"><i></i><i></i><i></i></span></div>';
  $("#stream").appendChild(wrap);
  scrollStream();
  return wrap;
}

/* --------------------- §13 多模态：默认关闭，只在有意义的事件触发 --------------------- */
let audioCtx = null;
function blip(freq = 480, dur = 0.05) {
  if (!state.sound) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = audioCtx || new AC();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const now = audioCtx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  } catch (e) { /* 静默失败，不影响交互 */ }
}
function haptic(ms = 8) {
  if (!state.sound) return;
  if (navigator.vibrate) navigator.vibrate(ms);   // 与视觉同帧
}
function send() {
  const input = $("#composerInput");
  const value = input.value.trim();
  if (!value) return;
  if (state.screen !== "conversation") go("conversation");
  // 交给后端状态机：空白与"等待中重复发送"都由它拒绝
  const result = chat.send(value);
  if (result.status === "rejected") return;
  input.value = "";
  renderStream();
  blip(520, 0.05);
  haptic(4);
}
$("#sendBtn").addEventListener("click", send);
$("#composerInput").addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); send(); } });

/* ---- 两版滑块：拖动时更新数值与已填充比例 ---- */
function bindSlider(id, valueId, format) {
  const el = $(id);
  if (!el) return;
  const paint = () => {
    const min = Number(el.min), max = Number(el.max), v = Number(el.value);
    el.style.setProperty("--fill", ((v - min) / (max - min) * 100).toFixed(1) + "%");
    const out = $(valueId);
    if (out) out.textContent = format(v);
  };
  el.addEventListener("input", paint);
  paint();
}
bindSlider("#speedSlider", "#speedVal", v => (v / 10).toFixed(1) + "x");
bindSlider("#volSlider", "#volVal", v => Math.round(v) + "%");

/* ============ v5：背景点阵 + 指针位置驱动的扩散 ============
   取代 v4 的"跟随点串"。做法是常见的 canvas 粒子场：
   · 点阵按固定间距铺满主区，静止时是一层很淡的纹理
   · 指针附近的点被"推开"并稍微提亮，越靠近越明显 → 形成一圈扩散
   · 推开用弹簧收回来（推得快、收得稳），没有点动的时候直接停帧
   参数全部写在 styles.css 的 --dot-* 里，这里只读不写死。 */
const DOTS = {
  cv: null, cx: null, dpr: 1, w: 0, h: 0,
  gap: 26, base: 1, rad: 200, push: 24,
  ink: "10 10 10", alpha: 0.15, styles: [],
  grid: [], ax: -9999, ay: -9999, hasPointer: false,
  raf: 0, enabled: true
};

function dotsToken() {
  const cs = getComputedStyle(root);
  const num = (k, d) => { const v = parseFloat(cs.getPropertyValue(k)); return isFinite(v) ? v : d; };
  DOTS.gap = num("--dot-gap", 26);
  DOTS.base = num("--dot-base", 1);
  DOTS.alpha = num("--dot-alpha", 0.15);
  DOTS.ink = (cs.getPropertyValue("--dot-ink") || "10 10 10").trim();
  // 亮度按档位预生成，避免每帧拼 2000 个字符串
  DOTS.styles = [];
  for (let i = 0; i <= 12; i++) {
    const a = Math.min(0.92, DOTS.alpha * (1 + (i / 12) * 3.2));
    // 注意：--dot-ink 是空格分隔的三个通道，必须用 rgb(r g b / a) 这种现代写法。
    // 写成 rgba(r g b, a) 是非法值，fillStyle 会被静默忽略 → 所有点都变成纯黑。
    DOTS.styles.push("rgb(" + DOTS.ink + " / " + a.toFixed(3) + ")");
  }
}

function dotsBuild() {
  const cv = DOTS.cv;
  if (!cv) return;
  const rect = cv.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  DOTS.w = w; DOTS.h = h; DOTS.dpr = dpr;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  DOTS.cx = cv.getContext("2d");
  DOTS.cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  dotsToken();
  DOTS.grid.length = 0;
  const gap = DOTS.gap, off = gap / 2;
  for (let y = off; y < h; y += gap) {
    for (let x = off; x < w; x += gap) {
      DOTS.grid.push({ x: x, y: y, ox: 0, oy: 0, vx: 0, vy: 0, a: 0 });
    }
  }
  dotsPaint();
}

function dotsPaint() {
  const cx = DOTS.cx;
  if (!cx) return;
  cx.clearRect(0, 0, DOTS.w, DOTS.h);
  const g = DOTS.grid, base = DOTS.base, styles = DOTS.styles;
  for (let i = 0; i < g.length; i++) {
    const d = g[i];
    const r = base * (1 + d.a * 1.45);
    if (r <= 0.06) continue;
    let b = (d.a * 12) | 0;
    if (b > 12) b = 12;
    cx.beginPath();
    cx.arc(d.x + d.ox, d.y + d.oy, r, 0, 6.2832);
    cx.fillStyle = styles[b];
    cx.fill();
  }
}

function dotsFrame() {
  DOTS.raf = 0;
  const g = DOTS.grid;
  const ax = DOTS.ax, ay = DOTS.ay, rad = DOTS.rad, push = DOTS.push, rad2 = rad * rad;
  let live = 0;
  for (let i = 0; i < g.length; i++) {
    const d = g[i];
    let tx = 0, ty = 0, ta = 0;
    if (DOTS.hasPointer) {
      const dx = d.x - ax, dy = d.y - ay;
      const q = dx * dx + dy * dy;
      if (q < rad2) {
        const dist = Math.sqrt(q) || 0.001;
        const t = 1 - dist / rad;
        const e = t * t * (3 - 2 * t);        // smoothstep：边缘过渡自然，中心最明显
        const p = push * e;
        tx = (dx / dist) * p;                 // 从指针指向外，所以内侧空、外侧聚
        ty = (dy / dist) * p;
        ta = e;
      }
    }
    d.vx = (d.vx + (tx - d.ox) * 0.20) * 0.80;
    d.vy = (d.vy + (ty - d.oy) * 0.20) * 0.80;
    d.ox += d.vx; d.oy += d.vy;
    d.a += (ta - d.a) * 0.18;
    if (d.ox * d.ox + d.oy * d.oy > 0.0036 || d.vx * d.vx + d.vy * d.vy > 0.0006 || Math.abs(d.a - ta) > 0.005) live++;
  }
  dotsPaint();
  if (live && DOTS.enabled) DOTS.raf = requestAnimationFrame(dotsFrame);
}

function dotsKick() {
  if (!DOTS.enabled || DOTS.raf) return;
  DOTS.raf = requestAnimationFrame(dotsFrame);
}

function dotsAt(clientX, clientY) {
  const cv = DOTS.cv;
  if (!cv) return;
  const r = cv.getBoundingClientRect();
  const lx = clientX - r.left, ly = clientY - r.top;
  const inside = lx > -60 && ly > -60 && lx < r.width + 60 && ly < r.height + 60;
  DOTS.hasPointer = inside;
  DOTS.ax = inside ? lx : -9999;
  DOTS.ay = inside ? ly : -9999;
  dotsKick();
}

function dotsInit() {
  DOTS.cv = $("#dotfield");
  if (!DOTS.cv) return;
  dotsBuild();
  // 触屏 / 减少动态效果：保留静态点阵，不做指针跟随
  const canFollow = !reduceMotion && matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (canFollow) {
    window.addEventListener("pointermove", (e) => dotsAt(e.clientX, e.clientY), { passive: true });
    window.addEventListener("pointerdown", (e) => dotsAt(e.clientX, e.clientY), { passive: true });
    document.addEventListener("pointerleave", () => dotsAt(-9999, -9999), { passive: true });
  }
  let rz = 0;
  window.addEventListener("resize", () => {
    clearTimeout(rz);
    rz = setTimeout(dotsBuild, 140);
  });
  // 主题/语言切换会改变点的颜色，重算一次
  new MutationObserver(() => { dotsToken(); dotsPaint(); })
    .observe(root, { attributes: true, attributeFilter: ["data-theme"] });
}

dotsInit();

/* ------------------------------ 启动 ------------------------------ */
/* 纠正偏好接到后端：m0-v2 默认关闭，开关只影响之后的提交 */
const correctionToggle = $$(".card .toggle input[type='checkbox']")[0];
if (correctionToggle) {
  correctionToggle.checked = false;
  correctionToggle.addEventListener("change", () => chat.setCorrectionMode(correctionToggle.checked));
}

chat.subscribe(() => renderStream());
renderStream();
applyText();
$(".screen[data-screen='conversation']").classList.add("is-active");
syncSegs();
syncNav();
