# -*- coding: utf-8 -*-
import os
import logging
from datetime import datetime, timedelta
from google.cloud import storage

logger = logging.getLogger(__name__)

class PromptManager:
    """プロンプトをGCSまたはローカルから読み込み、キャッシュ管理するクラス"""

    def __init__(self, bucket_name=None, cache_minutes=60):
        self.bucket_name = bucket_name or os.getenv("PROMPTS_BUCKET_NAME", "hp-support-prompts-1")
        self.cache_minutes = cache_minutes
        self.prompts = {}
        self.last_loaded = None
        self.use_local_fallback = True  # ローカルフォールバックを有効化

    def _should_reload(self):
        """キャッシュの有効期限をチェック"""
        if not self.last_loaded:
            return True
        return datetime.now() - self.last_loaded > timedelta(minutes=self.cache_minutes)

    def _load_from_gcs(self, prompt_name):
        """GCSからプロンプトを読み込む"""
        try:
            storage_client = storage.Client()
            bucket = storage_client.bucket(self.bucket_name)
            blob = bucket.blob(f"prompts/{prompt_name}.txt")

            if blob.exists():
                content = blob.download_as_text()
                logger.info(f"Loaded prompt '{prompt_name}' from GCS ({len(content)} chars)")
                return content
            else:
                logger.warning(f"Prompt '{prompt_name}' not found in GCS")
                return None
        except Exception as e:
            logger.warning(f"Failed to load prompt '{prompt_name}' from GCS: {e}")
            return None

    def _get_local_fallback(self, prompt_name):
        """ローカルフォールバックプロンプトを返す"""
        fallback_prompts = {
            "chat_system": """あなたはHPサポートシステムのAIアシスタントです。

# 重要な指示

ユーザーからWebサイトの修正依頼を受けた場合、以下のJSON形式で返答してください：

```json
{
  "action": "immediate",
  "response": "ユーザーへの応答メッセージ",
  "modification": {
    "selector": "CSSセレクタ（例: h1, .button, #main-title）",
    "action": "replace|style|insert|remove",
    "content": "新しいコンテンツ（action=replaceまたはinsertの場合）",
    "styles": {"CSS属性": "値"} (action=styleの場合),
    "description": "修正の説明"
  }
}
```

## 修正アクションの種類:

- **replace**: 要素の内容を置き換え
- **style**: CSSスタイルを変更
- **insert**: 新しい要素を挿入
- **remove**: 要素を削除

## 例:

**ユーザー:** タイトルを「新しいタイトル」に変更して

**あなたの応答:**
```json
{
  "action": "immediate",
  "response": "タイトルを「新しいタイトル」に変更しました。",
  "modification": {
    "selector": "h1",
    "action": "replace",
    "content": "新しいタイトル",
    "description": "メインタイトルの変更"
  }
}
```

**ユーザー:** ボタンの色を青にして

**あなたの応答:**
```json
{
  "action": "immediate",
  "response": "ボタンの色を青に変更しました。",
  "modification": {
    "selector": ".button",
    "action": "style",
    "styles": {
      "background-color": "#0066cc",
      "color": "#ffffff"
    },
    "description": "ボタンの色を青に変更"
  }
}
```

## 一般的な会話の場合:

修正依頼でない場合は、通常のテキストで応答してください。JSON形式は使用しません。

常に親切で、明確な説明を心がけてください。
""",

            "selection_analysis": """ユーザーがWebサイト上でテキストを選択しました。
選択されたコンテンツに基づいて、適切な質問や提案を生成してください。

選択内容:
{selection_content}

選択タイプ: {selection_type}

この選択に対して、ユーザーが何をしたいのか推測し、適切な質問を生成してください。
例: 「このテキストを変更しますか？」「このセクションのスタイルを変更しますか？」
""",

            "fix_instructions": """以下の会話履歴に基づいて、Webサイトの修正指示書を生成してください。

生成日時: {timestamp}
セッションID: {session_id}

会話履歴:
{conversation_text}

## 修正指示書フォーマット:

<h1>Webサイト修正指示書</h1>

<h2>1. 概要</h2>
<p>本指示書は、上記の会話内容に基づき実施すべき修正内容をまとめたものです。</p>

<h2>2. 修正項目</h2>
<p>以下の修正を実施してください：</p>

<h3>修正1: [修正タイトル]</h3>
<p><strong>対象:</strong> [対象要素]</p>
<p><strong>現状:</strong> [現在の状態]</p>
<p><strong>修正内容:</strong> [具体的な修正内容]</p>

<h3>修正2: [修正タイトル]</h3>
...

<h2>3. 実装方法</h2>
<p>Astroファイルでの実装手順...</p>

<h2>4. テスト項目</h2>
<p>修正後に確認すべき項目...</p>

この形式で、会話内容に基づいた修正指示書を生成してください。
"""
        }

        return fallback_prompts.get(prompt_name, f"プロンプト '{prompt_name}' が見つかりません。")

    def get(self, prompt_name, **kwargs):
        """プロンプトを取得し、変数を置換する"""
        # キャッシュのリロードが必要かチェック
        if self._should_reload() or prompt_name not in self.prompts:
            # まずGCSから読み込みを試みる
            content = self._load_from_gcs(prompt_name)

            # GCSから取得できない場合はローカルフォールバックを使用
            if content is None and self.use_local_fallback:
                content = self._get_local_fallback(prompt_name)
                logger.info(f"Using local fallback for prompt '{prompt_name}'")

            if content:
                self.prompts[prompt_name] = content
                self.last_loaded = datetime.now()

        # プロンプトを取得
        prompt = self.prompts.get(prompt_name, self._get_local_fallback(prompt_name))

        # 変数を置換
        if kwargs:
            try:
                prompt = prompt.format(**kwargs)
            except KeyError as e:
                logger.warning(f"Missing variable in prompt '{prompt_name}': {e}")

        return prompt

    def reload(self):
        """プロンプトキャッシュを強制リロード"""
        self.prompts.clear()
        self.last_loaded = None
        logger.info("Prompt cache cleared")
        return {"message": "Cache cleared successfully"}
