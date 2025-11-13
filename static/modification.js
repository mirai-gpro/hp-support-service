/**
 * ModificationManager - iframe内のHTMLを即座に修正する機能
 */
class ModificationManager {
    constructor() {
        this.modifications = [];
        this.sessionId = null;
        this.selectedElement = null;
        this.selectedText = null;
        console.log('[ModificationManager] 初期化完了');
    }

    /**
     * セッションIDを設定
     */
    setSessionId(sessionId) {
        this.sessionId = sessionId;
        console.log(`[ModificationManager] SessionID設定: ${sessionId}`);
    }

    /**
     * 選択されたテキスト情報を設定
     */
    setSelection(selectionData) {
        this.selectedElement = selectionData.selector;
        this.selectedText = selectionData.text;
        console.log('[ModificationManager] Selection set:', selectionData);
    }

    /**
     * 選択をクリア
     */
    clearSelection() {
        this.selectedElement = null;
        this.selectedText = null;
        console.log('[ModificationManager] Selection cleared');
    }

    /**
     * JSONから修正を適用
     */
    applyModificationFromJSON(modification) {
        console.log('[ModificationManager] Applying modification:', modification);

        const iframe = document.getElementById('hp-preview');
        if (!iframe) {
            console.error('[ModificationManager] Preview iframe not found');
            return false;
        }

        try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            const selector = modification.selector;
            const elements = iframeDoc.querySelectorAll(selector);

            if (elements.length === 0) {
                console.warn(`[ModificationManager] No elements found for selector: ${selector}`);
                return false;
            }

            console.log(`[ModificationManager] Found ${elements.length} element(s) for selector: ${selector}`);

            elements.forEach((element, index) => {
                switch (modification.action) {
                    case 'replace':
                        element.innerHTML = modification.content;
                        console.log(`[ModificationManager] Replaced content in element ${index + 1}`);
                        break;

                    case 'style':
                        if (modification.styles) {
                            Object.keys(modification.styles).forEach(prop => {
                                element.style[prop] = modification.styles[prop];
                            });
                            console.log(`[ModificationManager] Applied styles to element ${index + 1}:`, modification.styles);
                        }
                        break;

                    case 'insert':
                        const newElement = iframeDoc.createElement('div');
                        newElement.innerHTML = modification.content;
                        element.appendChild(newElement.firstChild);
                        console.log(`[ModificationManager] Inserted content into element ${index + 1}`);
                        break;

                    case 'remove':
                        element.remove();
                        console.log(`[ModificationManager] Removed element ${index + 1}`);
                        break;

                    default:
                        console.warn(`[ModificationManager] Unknown action: ${modification.action}`);
                        return false;
                }
            });

            // 修正履歴に追加
            this.modifications.push({
                timestamp: new Date().toISOString(),
                ...modification
            });

            console.log('[ModificationManager] Modification applied successfully');
            return true;

        } catch (error) {
            console.error('[ModificationManager] Error applying modification:', error);
            return false;
        }
    }

    /**
     * 修正履歴を取得
     */
    getModifications() {
        return this.modifications;
    }

    /**
     * 修正履歴をクリア
     */
    clearModifications() {
        this.modifications = [];
        console.log('[ModificationManager] Modifications cleared');
    }

    /**
     * 修正指示書を生成（HTML形式）
     */
    generateInstructionDocument() {
        if (this.modifications.length === 0) {
            return '<p>修正履歴がありません</p>';
        }

        let html = '<h1>Webサイト修正指示書</h1>';
        html += '<h2>修正履歴</h2>';
        html += '<ol>';

        this.modifications.forEach((mod, index) => {
            html += '<li>';
            html += `<h3>修正 ${index + 1}: ${mod.description || '説明なし'}</h3>`;
            html += `<p><strong>セレクタ:</strong> ${mod.selector}</p>`;
            html += `<p><strong>アクション:</strong> ${mod.action}</p>`;

            if (mod.content) {
                html += `<p><strong>コンテンツ:</strong> ${this.escapeHtml(mod.content)}</p>`;
            }

            if (mod.styles) {
                html += '<p><strong>スタイル:</strong></p>';
                html += '<ul>';
                Object.keys(mod.styles).forEach(prop => {
                    html += `<li>${prop}: ${mod.styles[prop]}</li>`;
                });
                html += '</ul>';
            }

            html += `<p><strong>実施日時:</strong> ${new Date(mod.timestamp).toLocaleString('ja-JP')}</p>`;
            html += '</li>';
        });

        html += '</ol>';

        html += '<h2>Astro実装方法</h2>';
        html += '<p>上記の修正を.astroファイルに反映し、Vercelで再デプロイしてください。</p>';

        return html;
    }

    /**
     * HTMLエスケープ
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// グローバルインスタンスを作成
if (typeof window !== 'undefined') {
    window.modificationManager = new ModificationManager();
    console.log('[ModificationManager] グローバルインスタンス作成完了');
}
