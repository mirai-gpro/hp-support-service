/**
 * 修正機能管理クラス（完全修正版）
 */
class ModificationManager {
    constructor() {
        this.modifications = [];
        this.selectedElement = null;
        this.selectedText = null;
        this.sessionId = null;
        this.iframeElement = null;
        console.log('[ModificationManager] 初期化完了');
    }

    setSessionId(sessionId) {
        this.sessionId = sessionId;
        console.log('[ModificationManager] SessionID設定:', sessionId);
    }

    classifyModification(userInput) {
        const immediatePatterns = [
            /(\d+)%(大きく|小さく)/,
            /もっと(大きく|小さく)/,
            /もう少し(大きく|小さく|長く|短く)/,
            /(大きく|小さく|短く)して/,
            /要約して/,
            /色を(変えて|変更して)/,
            /削除して/,
            /消して/,
            /取り除いて/
        ];
        
        const isImmediate = immediatePatterns.some(p => p.test(userInput));
        console.log('[ModificationManager] 修正タイプ判定:', isImmediate ? 'immediate' : 'batch', userInput);
        return isImmediate ? 'immediate' : 'batch';
    }

    // ★★★ 新規追加: JSON形式の修正指示を処理 ★★★
    applyModificationFromJSON(modificationObj) {
        console.log('[ModificationManager] JSON修正指示を適用:', modificationObj);

        const iframe = document.getElementById('hp-preview');
        if (!iframe) {
            console.error('[ModificationManager] iframeが見つかりません');
            return { success: false, message: 'プレビューが見つかりません' };
        }

        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (!iframeDoc) {
            console.error('[ModificationManager] iframe documentにアクセスできません');
            return { success: false, message: 'プレビューにアクセスできません' };
        }

        // セレクタが特殊形式（テキスト内容検索）の場合
        let element;
        if (modificationObj.selector.startsWith('__TEXT_CONTENT__')) {
            const textContent = modificationObj.selector.replace(/^__TEXT_CONTENT__/, '').replace(/__$/, '');
            console.log('[ModificationManager] テキスト内容で検索:', textContent);

            // 全要素を検索してテキスト内容が一致する要素を見つける
            const allElements = iframeDoc.querySelectorAll('*');
            let bestMatch = null;
            let bestMatchScore = -1;

            for (const el of allElements) {
                if (!el.textContent) continue;

                // 直接のテキストノードを取得
                const directText = Array.from(el.childNodes)
                    .filter(node => node.nodeType === Node.TEXT_NODE)
                    .map(node => node.textContent.trim())
                    .join(' ');

                const trimmedDirectText = directText.trim();
                const trimmedElText = el.textContent.trim();

                // 完全一致を最優先（直接テキストまたは全体テキスト）
                if (trimmedDirectText === textContent || trimmedElText === textContent) {
                    const childCount = el.children.length;
                    const score = 1000 - childCount; // 子要素が少ないほど高スコア

                    if (score > bestMatchScore) {
                        bestMatch = el;
                        bestMatchScore = score;
                        console.log('[ModificationManager] 完全一致発見:', el.tagName, 'directText:', trimmedDirectText.substring(0, 30), 'スコア:', score);
                    }
                }
                // 完全一致が見つからない場合のみ部分一致を検討
                else if (bestMatchScore < 1000) {
                    // 直接テキストに選択テキストが含まれる場合
                    if (trimmedDirectText.includes(textContent)) {
                        const childCount = el.children.length;
                        // 部分一致のスコアは常に完全一致より低い
                        const score = 100 - childCount;

                        if (score > bestMatchScore) {
                            bestMatch = el;
                            bestMatchScore = score;
                            console.log('[ModificationManager] 部分一致発見:', el.tagName, 'directText:', trimmedDirectText.substring(0, 30), 'スコア:', score);
                        }
                    }
                }
            }

            if (bestMatch) {
                element = bestMatch;
                console.log('[ModificationManager] テキスト内容で要素を発見:', element.tagName, element.textContent.substring(0, 50));
            }
        } else {
            element = iframeDoc.querySelector(modificationObj.selector);
        }

        if (!element) {
            console.error('[ModificationManager] 要素が見つかりません:', modificationObj.selector);
            return { success: false, message: '要素が見つかりません' };
        }

        try {
            // 修正前のHTMLを保存（削除前に保存が重要）
            const originalHtml = element.outerHTML;

            switch(modificationObj.type) {
                case 'text':
                    element.textContent = modificationObj.newValue;
                    break;

                case 'color':
                    element.style.color = modificationObj.newValue;
                    break;

                case 'background':
                    element.style.backgroundColor = modificationObj.newValue;
                    break;

                case 'fontSize':
                    element.style.fontSize = modificationObj.newValue;
                    break;

                case 'style':
                    if (modificationObj.styles) {
                        Object.entries(modificationObj.styles).forEach(([prop, value]) => {
                            element.style[prop] = value;
                        });
                    }
                    break;

                case 'attribute':
                    element.setAttribute(modificationObj.attribute, modificationObj.newValue);
                    break;

                case 'delete':
                    // 要素を削除（フェードアウトアニメーション付き）
                    element.style.transition = 'opacity 0.3s';
                    element.style.opacity = '0';
                    setTimeout(() => {
                        if (element.parentNode) {
                            element.parentNode.removeChild(element);
                        }
                    }, 300);
                    break;

                default:
                    console.error('[ModificationManager] 未対応の修正タイプ:', modificationObj.type);
                    return { success: false, message: '未対応の修正タイプです' };
            }

            // 実際に見つかった要素の正確なセレクタを生成
            const actualSelector = this.getElementSelectorFor(element);

            // 修正を記録（削除の場合はoriginalHtmlを使用）
            this.recordModification({
                type: 'immediate',
                userInput: modificationObj.description,
                elementSelector: actualSelector,
                selectedText: this.selectedText || element.textContent?.substring(0, 100),
                originalHtml: originalHtml,
                modifiedHtml: modificationObj.type === 'delete' ? '<!-- 削除されました -->' : element.outerHTML,
                modificationType: modificationObj.type,
                status: 'applied'
            });

            console.log('[ModificationManager] JSON修正適用完了');
            return { success: true, message: '修正を適用しました' };

        } catch (error) {
            console.error('[ModificationManager] JSON修正適用エラー:', error);
            return { success: false, message: `修正の適用に失敗: ${error.message}` };
        }
    }

    applyImmediateModification(userInput) {
        console.log('[ModificationManager] 即時修正開始:', userInput);
        console.log('[ModificationManager] iframeElement:', this.iframeElement);
        console.log('[ModificationManager] selectedText:', this.selectedText);

        if (!this.iframeElement) {
            console.error('[ModificationManager] iframe要素が選択されていません');
            return { success: false, message: '要素が選択されていません' };
        }

        try {
            const element = this.iframeElement;
            const originalHtml = element.outerHTML;
            let modifiedHtml = originalHtml;
            let modificationType = '';
            let message = '';

            // パーセンテージでのサイズ変更
            const percentMatch = userInput.match(/(\d+)%(大きく|小さく)/);
            if (percentMatch) {
                const percent = parseInt(percentMatch[1]);
                const direction = percentMatch[2];
                const factor = direction === '大きく' ? (1 + percent / 100) : (1 - percent / 100);
                
                if (element.tagName === 'IMG') {
                    modifiedHtml = this.adjustImageSize(element, factor);
                } else {
                    modifiedHtml = this.adjustTextSize(element, factor);
                }
                modificationType = 'size';
                message = `文字サイズを${percent}%${direction}しました`;
            }
            // 通常のサイズ変更
            else if (userInput.includes('大きく') || userInput.includes('小さく')) {
                const factor = userInput.includes('大きく') ? 1.2 : 0.8;
                
                if (element.tagName === 'IMG') {
                    modifiedHtml = this.adjustImageSize(element, factor);
                } else {
                    modifiedHtml = this.adjustTextSize(element, factor);
                }
                modificationType = 'size';
                message = `サイズを変更しました`;
            }
            // 削除処理
            else if (userInput.includes('削除して') || userInput.includes('消して') || 
                     userInput.includes('取り除いて')) {
                this.removeElement(element);
                modificationType = 'delete';
                modifiedHtml = '<!-- 削除されました -->';
                message = `「${this.selectedText.substring(0, 30)}...」を削除しました`;
            }
            // 要約
            else if (userInput.includes('短く') || userInput.includes('要約')) {
                return this.handleSummarization(element, userInput, originalHtml);
            }

            // 修正を記録
            this.recordModification({
                type: 'immediate',
                userInput,
                elementSelector: this.getElementSelector(),
                selectedText: this.selectedText,
                originalHtml,
                modifiedHtml,
                modificationType,
                status: 'applied'
            });

            console.log('[ModificationManager] 即時修正完了:', message);
            return { success: true, message: message || '修正を適用しました' };
        } catch (error) {
            console.error('[ModificationManager] 修正適用エラー:', error);
            return { success: false, message: `修正の適用に失敗: ${error.message}` };
        }
    }

    adjustImageSize(element, factor) {
        const currentWidth = element.width || element.offsetWidth;
        const currentHeight = element.height || element.offsetHeight;

        element.style.width = `${currentWidth * factor}px`;
        element.style.height = `${currentHeight * factor}px`;

        console.log('[ModificationManager] 画像サイズ変更:', { currentWidth, currentHeight, factor });
        return element.outerHTML;
    }

    adjustTextSize(element, factor) {
        const iframe = document.getElementById('hp-preview');
        const iframeDoc = iframe.contentWindow.document;
        const computedStyle = iframe.contentWindow.getComputedStyle(element);
        const currentSize = parseFloat(computedStyle.fontSize);
        const newSize = currentSize * factor;
        
        element.style.fontSize = `${newSize}px`;

        console.log('[ModificationManager] テキストサイズ変更:', { currentSize, newSize, factor });
        return element.outerHTML;
    }

    removeElement(element) {
        console.log('[ModificationManager] 要素削除:', element.tagName, element.textContent?.substring(0, 50));
        
        element.style.transition = 'opacity 0.3s';
        element.style.opacity = '0';
        
        setTimeout(() => {
            const parent = element.parentNode;
            if (parent) {
                parent.removeChild(element);
                console.log('[ModificationManager] 要素削除完了');
            }
        }, 300);
    }

    async handleSummarization(element, userInput, originalHtml) {
        if (!this.sessionId) {
            return { success: false, message: 'セッションが開始されていません' };
        }

        try {
            const response = await fetch('/api/summarize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: element.textContent,
                    session_id: this.sessionId
                })
            });

            if (!response.ok) {
                throw new Error('要約に失敗しました');
            }

            const data = await response.json();
            const summary = data.summary || element.textContent;

            element.textContent = summary;

            this.recordModification({
                type: 'immediate',
                userInput,
                elementSelector: this.getElementSelector(),
                selectedText: this.selectedText,
                originalHtml,
                modifiedHtml: element.outerHTML,
                modificationType: 'summarize',
                status: 'applied'
            });

            return { success: true, message: '要約を適用しました' };
        } catch (error) {
            console.error('[ModificationManager] 要約エラー:', error);
            return { success: false, message: '要約に失敗しました' };
        }
    }

    recordBatchModification(userInput) {
        this.recordModification({
            type: 'batch',
            userInput: userInput,
            description: userInput,
            selectedText: this.selectedText,
            elementSelector: this.getElementSelector(),
            status: 'pending'
        });
    }

    getElementSelector() {
        const element = this.iframeElement || this.selectedElement;
        if (!element) return 'unknown';

        return this.getElementSelectorFor(element);
    }

    getElementSelectorFor(element) {
        if (!element) return 'unknown';

        let selector = element.tagName?.toLowerCase() || 'unknown';

        if (element.id) {
            selector += `#${element.id}`;
        } else if (element.className && typeof element.className === 'string') {
            const classes = element.className.trim().replace(/\s+/g, '.');
            if (classes) {
                selector += `.${classes}`;
            }
        }

        return selector;
    }

    recordModification(modification) {
        modification.id = this.generateId();
        modification.timestamp = new Date();
        modification.pageUrl = window.location.pathname;

        // Undo用に親要素と位置情報を記録
        const iframe = document.getElementById('hp-preview');
        if (iframe && modification.elementSelector) {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            const element = iframeDoc.querySelector(modification.elementSelector);

            if (element && element.parentNode) {
                // 親要素のセレクタを記録
                modification.parentSelector = this.getElementSelectorFor(element.parentNode);

                // 次の兄弟要素を記録（削除要素を復元する際の挿入位置）
                if (element.nextElementSibling) {
                    modification.nextSiblingSelector = this.getElementSelectorFor(element.nextElementSibling);
                } else {
                    modification.nextSiblingSelector = null;
                }

                // 親内での位置も記録（フォールバック）
                const siblings = Array.from(element.parentNode.children);
                modification.elementIndex = siblings.indexOf(element);
            }
        }

        this.modifications.push(modification);

        console.log('[ModificationManager] 修正を記録:', {
            id: modification.id,
            type: modification.type,
            userInput: modification.userInput,
            selectedText: modification.selectedText?.substring(0, 50)
        });
    }

    generateInstructionDocument() {
        console.log('[ModificationManager] 修正指示書生成開始 - 修正件数:', this.modifications.length);
        
        let doc = '# 修正指示書\n\n';
        doc += `## 対象ページ: ${window.location.pathname}\n`;
        doc += `## 作成日時: ${new Date().toLocaleString('ja-JP')}\n`;
        doc += `## 修正件数: ${this.modifications.length}件\n\n`;
        doc += '---\n\n';

        if (this.modifications.length === 0) {
            doc += '**修正履歴がありません**\n\n';
            console.warn('[ModificationManager] 修正履歴が空です');
            return doc;
        }

        this.modifications.forEach((mod, i) => {
            doc += `## 修正 ${i + 1}: ${this.getModificationTitle(mod)}\n\n`;
            doc += `- **タイプ**: ${mod.type === 'immediate' ? '$2713 即時反映済み' : '$23F3 バッチ処理待ち'}\n`;
            doc += `- **指示内容**: ${mod.userInput}\n`;
            doc += `- **実行日時**: ${mod.timestamp.toLocaleString('ja-JP')}\n`;
            doc += `- **状態**: ${mod.status === 'applied' ? '$2713 適用済み' : '$23F3 保留中'}\n`;

            if (mod.elementSelector) {
                doc += `- **対象要素**: \`${mod.elementSelector}\`\n`;
            }

            if (mod.selectedText) {
                const displayText = mod.selectedText.length > 100 
                    ? mod.selectedText.substring(0, 100) + '...' 
                    : mod.selectedText;
                doc += `- **選択テキスト**: "${displayText}"\n`;
            }

            if (mod.originalHtml && mod.modifiedHtml) {
                doc += `\n### 変更内容\n\n`;
                doc += `**修正前のHTML:**\n\`\`\`html\n${mod.originalHtml}\n\`\`\`\n\n`;
                doc += `**修正後のHTML:**\n\`\`\`html\n${mod.modifiedHtml}\n\`\`\`\n\n`;
            }

            doc += '---\n\n';
        });

        console.log('[ModificationManager] 修正指示書生成完了 - 文字数:', doc.length);
        return doc;
    }

    getModificationTitle(mod) {
        if (mod.type === 'immediate') {
            if (mod.userInput.match(/\d+%(大きく|小さく)/)) {
                const match = mod.userInput.match(/(\d+)%(大きく|小さく)/);
                return `文字サイズを${match[1]}%${match[2]}`;
            }
            if (mod.userInput.includes('大きく')) return 'サイズを大きく';
            if (mod.userInput.includes('小さく')) return 'サイズを小さく';
            if (mod.userInput.includes('短く') || mod.userInput.includes('要約')) return 'テキスト要約';
            if (mod.userInput.includes('色')) return '色変更';
            if (mod.userInput.includes('削除') || mod.userInput.includes('消して') || 
                mod.userInput.includes('取り除いて')) return 'テキスト削除';
            return '軽微な修正';
        }
        return '複雑な修正（バッチ処理）';
    }

    setSelectedElement(element, text) {
        this.iframeElement = element;
        this.selectedElement = {
            tagName: element.tagName,
            className: element.className,
            id: element.id
        };
        this.selectedText = text;

        console.log('[ModificationManager] 要素選択:', {
            tagName: element.tagName,
            textLength: text.length,
            text: text.substring(0, 50)
        });

        const selectionInfo = document.getElementById('selection-info');
        const selectionText = document.getElementById('selection-text');

        if (selectionInfo && selectionText) {
            if (element && text) {
                selectionText.textContent = text.length > 50 ? text.substring(0, 50) + '...' : text;
                selectionInfo.classList.add('active');
            } else {
                selectionText.textContent = '';
                selectionInfo.classList.remove('active');
            }
        }
    }

    clearSelection() {
        console.log('[ModificationManager] 選択クリア');
        this.iframeElement = null;
        this.selectedElement = null;
        this.selectedText = null;

        const selectionInfo = document.getElementById('selection-info');
        const selectionText = document.getElementById('selection-text');

        if (selectionInfo && selectionText) {
            selectionText.textContent = '';
            selectionInfo.classList.remove('active');
        }
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    undoLastModification() {
        console.log('[ModificationManager] Undo開始 - 履歴件数:', this.modifications.length);

        if (this.modifications.length === 0) {
            return { success: false, message: '元に戻す操作がありません' };
        }

        const lastMod = this.modifications.pop();
        console.log('[ModificationManager] 元に戻す修正:', {
            type: lastMod.modificationType,
            userInput: lastMod.userInput,
            selector: lastMod.elementSelector
        });

        const iframe = document.getElementById('hp-preview');
        if (!iframe) {
            console.error('[ModificationManager] iframeが見つかりません');
            return { success: false, message: 'プレビューが見つかりません' };
        }

        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (!iframeDoc) {
            console.error('[ModificationManager] iframe documentにアクセスできません');
            return { success: false, message: 'プレビューにアクセスできません' };
        }

        try {
            if (lastMod.modificationType === 'delete') {
                // 削除された要素を復元
                console.log('[ModificationManager] 削除要素を復元:', lastMod.parentSelector);

                const parent = iframeDoc.querySelector(lastMod.parentSelector);
                if (!parent) {
                    console.error('[ModificationManager] 親要素が見つかりません:', lastMod.parentSelector);
                    this.modifications.push(lastMod); // 失敗したので履歴に戻す
                    return { success: false, message: '親要素が見つかりません' };
                }

                // originalHtmlから要素を作成
                const temp = iframeDoc.createElement('div');
                temp.innerHTML = lastMod.originalHtml;
                const restoredElement = temp.firstChild;

                if (!restoredElement) {
                    console.error('[ModificationManager] 復元する要素が作成できません');
                    this.modifications.push(lastMod);
                    return { success: false, message: '要素を復元できません' };
                }

                // 挿入位置を特定して復元
                if (lastMod.nextSiblingSelector) {
                    const nextSibling = iframeDoc.querySelector(lastMod.nextSiblingSelector);
                    if (nextSibling) {
                        parent.insertBefore(restoredElement, nextSibling);
                        console.log('[ModificationManager] 次の兄弟要素の前に挿入');
                    } else {
                        parent.appendChild(restoredElement);
                        console.log('[ModificationManager] 親の末尾に追加（次の兄弟が見つからない）');
                    }
                } else if (typeof lastMod.elementIndex !== 'undefined') {
                    // インデックスを使って挿入
                    const children = Array.from(parent.children);
                    if (lastMod.elementIndex < children.length) {
                        parent.insertBefore(restoredElement, children[lastMod.elementIndex]);
                        console.log('[ModificationManager] インデックス', lastMod.elementIndex, 'に挿入');
                    } else {
                        parent.appendChild(restoredElement);
                        console.log('[ModificationManager] 親の末尾に追加（インデックスが範囲外）');
                    }
                } else {
                    parent.appendChild(restoredElement);
                    console.log('[ModificationManager] 親の末尾に追加');
                }

                console.log('[ModificationManager] 削除要素の復元完了');
                return { success: true, message: '削除した要素を復元しました' };

            } else {
                // その他の修正（サイズ、テキスト、色など）を元に戻す
                console.log('[ModificationManager] 修正を元に戻す:', lastMod.elementSelector);

                const element = iframeDoc.querySelector(lastMod.elementSelector);
                if (!element) {
                    console.error('[ModificationManager] 要素が見つかりません:', lastMod.elementSelector);
                    this.modifications.push(lastMod);
                    return { success: false, message: '要素が見つかりません' };
                }

                // originalHtmlから要素を復元
                const temp = iframeDoc.createElement('div');
                temp.innerHTML = lastMod.originalHtml;
                const restoredElement = temp.firstChild;

                if (!restoredElement) {
                    console.error('[ModificationManager] 復元する要素が作成できません');
                    this.modifications.push(lastMod);
                    return { success: false, message: '要素を復元できません' };
                }

                // 既存要素を復元要素で置き換え
                element.parentNode.replaceChild(restoredElement, element);
                console.log('[ModificationManager] 要素の置き換え完了');

                return { success: true, message: '前の修正を元に戻しました' };
            }
        } catch (error) {
            console.error('[ModificationManager] Undoエラー:', error);
            this.modifications.push(lastMod); // エラーが発生したので履歴に戻す
            return { success: false, message: `元に戻せませんでした: ${error.message}` };
        }
    }

    clearHistory() {
        this.modifications = [];
        console.log('[ModificationManager] 履歴クリア');
    }

    getModifications() {
        return this.modifications;
    }
}

// グローバルインスタンスを作成
window.modificationManager = new ModificationManager();
console.log('[ModificationManager] グローバルインスタンス作成完了');
