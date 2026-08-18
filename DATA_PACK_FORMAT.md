# 数据包格式

文件必须是 JSON，顶层至少包含 `groups`。每个故事组建议使用 10 个词和 10 道 Quiz。

```json
{
  "schemaVersion": 1,
  "title": "我的故事词汇学习器",
  "subtitle": "导入你的故事包 · 阅读 → 回忆 → Quiz",
  "groups": [
    {
      "id": "story-001",
      "topic": "车站",
      "storyTitle": "雨停之前的车站",
      "englishTitle": "Before the Rain Stopped",
      "story": "支持普通文字，以及 <b>word（中文提示）</b> 和 <br> 换行。",
      "words": [
        {
          "word": "hesitate",
          "meaning": "犹豫；迟疑",
          "hook": "想行动，却因为不确定停了一下。",
          "collocations": "hesitate to do",
          "explanation": "因为不确定、害怕或犹豫而暂时不行动。",
          "origin": "来自拉丁语 haesitare。",
          "example": "She hesitated before opening the door."
        }
      ],
      "quiz": [
        {
          "q": "She began to ___.",
          "o": ["hesitate", "resolve", "conceal", "encounter"],
          "a": 0,
          "f": "hesitate = 犹豫。"
        }
      ]
    }
  ],
  "candidates": [
    {"word": "resilience", "meaning": "韧性；复原力"}
  ],
  "defaultCompleteGroups": []
}
```

也兼容旧式词汇数组：`["word", "中文意思", "记忆钩子", "常见搭配", {"explanation":"..."}]`，以及旧式 Quiz 字段 `q/o/a/f`。
