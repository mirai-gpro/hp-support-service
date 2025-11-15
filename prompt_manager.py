# -*- coding: utf-8 -*-
"""
改善されたプロンプト管理
"""
import os
from google.cloud import storage
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

class PromptManager:
    def __init__(self):
        self.bucket_name = os.getenv("PROMPTS_BUCKET_NAME", "")
        self.prompts = {}  # プロンプトのキャッシュ
        self.last_loaded = None
        self.cache_minutes = 60  # キャッシュ有効期限を60分に延長
        
        # 初期化時に即座に読み込み
        if self.bucket_name:
            try:
                self.client = storage.Client()
                self.bucket = self.client.bucket(self.bucket_name)
                logger.info(f"[PromptManager] バケット: {self.bucket_name}")
                self._load_from_gcs()  # 初期化時に読み込み
            except Exception as e:
                logger.error(f"[PromptManager] GCS初期化失敗: {e}")
                self._load_defaults()
        else:
            logger.warning("[PromptManager] バケット未設定 - デフォルトプロンプト使用")
            self._load_defaults()
    
    def get(self, name, **variables):
        """
        プロンプトを取得
        
        Args:
            name: プロンプト名（例: "fix_instructions"）
            **variables: テンプレート変数（例: session_id="abc"）
        
        Returns:
            展開されたプロンプト文字列
        """
        # キャッシュチェック（非同期で更新）
        if self._is_cache_expired():
            try:
                self._load_from_gcs()
            except Exception as e:
                logger.warning(f"[PromptManager] 更新失敗、キャッシュ使用: {e}")
        
        # プロンプト取得
        template = self.prompts.get(name)
        if not template:
            logger.warning(f"[PromptManager] プロンプト未登録: {name}")
            template = self._get_default(name)
        
        # 変数展開
        try:
            return template.format(**variables)
        except KeyError as e:
            logger.warning(f"[PromptManager] 変数不足: {e}")
            return template
    
    def reload(self):
        """プロンプトを強制再読み込み（管理用API）"""
        self._load_from_gcs(force=True)
        return {
            "loaded": list(self.prompts.keys()),
            "time": self.last_loaded.isoformat() if self.last_loaded else None,
            "source": "gcs" if self.bucket_name else "default"
        }
    
    def _is_cache_expired(self):
        """キャッシュが期限切れか確認"""
        if not self.last_loaded:
            return True
        
        elapsed = datetime.now() - self.last_loaded
        return elapsed.total_seconds() > (self.cache_minutes * 60)
    
    def _load_from_gcs(self, force=False):
        """GCSからプロンプトを読み込み"""
        if not self.bucket_name:
            return
        
        try:
            # prompts/ ディレクトリ内の .txt ファイルを読み込み
            blobs = list(self.bucket.list_blobs(prefix="prompts/"))
            
            loaded_count = 0
            for blob in blobs:
                if blob.name.endswith(".txt"):
                    # ファイル名からキー名を作成
                    key = blob.name.split("/")[-1].replace(".txt", "")
                    content = blob.download_as_text(encoding='utf-8')
                    self.prompts[key] = content
                    loaded_count += 1
                    logger.debug(f"[PromptManager] 読み込み: {key} ({len(content)}文字)")
            
            self.last_loaded = datetime.now()
            logger.info(f"[PromptManager] ? GCSから{loaded_count}個のプロンプトを読み込み完了")
            
        except Exception as e:
            logger.error(f"[PromptManager] GCS読み込み失敗: {e}")
            if not self.prompts:  # 初回読み込み失敗時のみデフォルトを使用
                self._load_defaults()
    
    def _load_defaults(self):
        """デフォルトプロンプトを読み込み"""
        self.prompts = {
            "fix_instructions": """以下の会話から修正指示書を作成してください：

# 修正指示書

## 基本情報
- 作成日時: {timestamp}
- セッションID: {session_id}

## 要件
（会話から抽出）

## 修正手順
1. 
2. 
3. 

【会話ログ】
{conversation_text}
""",
            "chat_system": """あなたはWebサイト制作のアシスタントです。
クライアントの要望を理解し、具体的な提案をしてください。""",
            
            "selection_analysis": """以下の選択内容を分析してください：

{selection_content}

タイプ: {selection_type}
コメント: {user_comment}
"""
        }
        self.last_loaded = datetime.now()
        logger.info(f"[PromptManager] デフォルトプロンプト使用: {len(self.prompts)}個")
    
    def _get_default(self, name):
        """デフォルトプロンプトを取得"""
        defaults = {
            "fix_instructions": "修正指示書を作成してください。\n\n{conversation_text}",
            "chat_system": "あなたはアシスタントです。",
            "selection_analysis": "以下を分析してください：\n{selection_content}"
        }
        return defaults.get(name, f"プロンプト '{name}' が見つかりません")