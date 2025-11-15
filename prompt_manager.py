"""
プロンプト管理クラス
"""
from datetime import datetime
import os


class PromptManager:
    def __init__(self, cache_minutes=60):
        self.prompts = {}
        self.last_loaded = None
        self.cache_minutes = cache_minutes
        self._initialize_default_prompts()

    def _initialize_default_prompts(self):
        """デフォルトプロンプトを初期化"""
        self.prompts = {
            "fix_instructions": """
あなたはHTML修正アシスタントです。
ユーザーの指示に従って、適切な修正指示を生成してください。
""",
            "chat_system": """
あなたは親切なアシスタントです。
ユーザーの質問に丁寧に答えてください。
""",
            "auto_question_default": """
選択されたテキストに関する質問を生成してください。
""",
            "generate_fix_default": """
選択されたテキストに対する修正指示を生成してください。
"""
        }
        self.last_loaded = datetime.now()

    def get(self, name, default=None):
        """プロンプトを取得"""
        return self.prompts.get(name, default or "")

    def reload(self):
        """プロンプトを再読み込み"""
        self._initialize_default_prompts()
        return {
            "status": "success",
            "loaded": len(self.prompts),
            "timestamp": datetime.now().isoformat()
        }
