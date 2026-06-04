// text-improvement.js — Content Script
// Handles keyboard shortcut and floating button for Gemini-powered text improvement.

(function () {
  'use strict';

  if (window.__ninaTextImprovementLoaded) return;
  window.__ninaTextImprovementLoaded = true;

  const STORAGE_KEY = 'nina-settings';
  const DEFAULT_SETTINGS = {
    aiTextUseShortcut: true,
    aiTextShortcut: 'Alt+P',
    aiTextUseButton: true,
    aiTextSpelling: true,
    aiTextPunctuation: true,
    aiTextCustomActive: false,
    aiTextCustomPrompt: ''
  };

  let settings = { ...DEFAULT_SETTINGS };
  let activeBtnHost = null;
  let lastMouseX = 0;
  let lastMouseY = 0;
  let isImproving = false;

  // Get active element recursively (handles Shadow DOM)
  function getActiveElement(root = document) {
    const active = root.activeElement;
    if (active && active.shadowRoot && active.shadowRoot.activeElement) {
      return getActiveElement(active.shadowRoot);
    }
    return active;
  }

  // Get selection object (handles Shadow DOM)
  function getSelectionObject(activeEl) {
    if (activeEl && activeEl.getRootNode) {
      const root = activeEl.getRootNode();
      if (root && root.getSelection) {
        return root.getSelection();
      }
    }
    return window.getSelection();
  }

  // Load Settings
  function loadLocalSettings() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(STORAGE_KEY, (result) => {
          if (chrome.runtime.lastError) return;
          if (result[STORAGE_KEY]) {
            settings = { ...DEFAULT_SETTINGS, ...result[STORAGE_KEY] };
          }
        });
      }
    } catch (_) {}
  }

  loadLocalSettings();

  // Listen for settings changes
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[STORAGE_KEY]) {
          settings = { ...DEFAULT_SETTINGS, ...changes[STORAGE_KEY].newValue };
          removeButton();
        }
      });
    }
  } catch (_) {}

  // Track Mouse Coordinates to position floating button
  document.addEventListener('mouseup', (e) => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    
    // Slight delay to allow selection APIs to update
    setTimeout(checkSelection, 30);
  });

  document.addEventListener('keyup', (e) => {
    // If user selects text using Shift + Arrows, check selection
    if (e.shiftKey && (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End')) {
      setTimeout(checkSelection, 30);
    }
  });

  // Global keydown for Shortcut Trigger
  document.addEventListener('keydown', (e) => {
    if (!settings.aiTextUseShortcut || !settings.aiTextShortcut || isImproving) return;

    if (matchShortcut(e, settings.aiTextShortcut)) {
      const details = getSelectionDetails();
      if (details) {
        e.preventDefault();
        e.stopPropagation();
        
        // Spawn/position the button first to show visual feedback (spinner/success)
        createOrPositionButton(details, false);
        const btn = activeBtnHost.shadowRoot.querySelector('.improver-btn');
        triggerTextImprovement(details, btn);
      }
    }
  }, true); // capturing phase to bypass site listeners

  // Match Shortcut Helper
  function matchShortcut(e, shortcutStr) {
    if (!shortcutStr) return false;
    const parts = shortcutStr.split('+');
    const key = parts[parts.length - 1].toLowerCase();

    const ctrlRequired = parts.includes('Ctrl');
    const altRequired = parts.includes('Alt');
    const shiftRequired = parts.includes('Shift');
    const metaRequired = parts.includes('Meta');

    const isKeyMatch = e.key.toLowerCase() === key || e.code.toLowerCase() === `key${key}` || e.code.toLowerCase() === key;

    return isKeyMatch &&
           e.ctrlKey === ctrlRequired &&
           e.altKey === altRequired &&
           e.shiftKey === shiftRequired &&
           e.metaKey === metaRequired;
  }

  // Get current selection details if inside an editable context
  function getSelectionDetails() {
    const active = getActiveElement();
    if (!active) return null;

    // Check if input or textarea
    if (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') {
      // Inputs like checkbox/radio/submit don't support selection
      const unsupportedTypes = ['checkbox', 'radio', 'button', 'submit', 'image', 'file', 'hidden'];
      if (unsupportedTypes.includes(active.type)) return null;

      try {
        const start = active.selectionStart;
        const end = active.selectionEnd;
        if (start !== undefined && end !== undefined && start !== end) {
          const selectedText = active.value.substring(start, end);
          if (selectedText.trim().length > 0) {
            return {
              element: active,
              text: selectedText,
              isInput: true,
              start,
              end
            };
          }
        }
      } catch (_) {}
    }

    // Check if contenteditable
    const sel = getSelectionObject(active);
    if (sel && sel.rangeCount > 0 && sel.toString().trim().length > 0) {
      let node = sel.anchorNode;
      let isEditable = false;
      let editableContainer = null;
      
      while (node && node !== document.body) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const ce = node.getAttribute('contenteditable');
          if ((ce && ce !== 'false') || node.isContentEditable) {
            isEditable = true;
            editableContainer = node;
            break;
          }
        }
        node = node.parentNode || node.host;
      }

      if (isEditable && editableContainer) {
        return {
          element: editableContainer,
          text: sel.toString(),
          isInput: false
        };
      }
    }

    return null;
  }

  // Check selection and draw/hide button
  function checkSelection() {
    if (isImproving) return;

    const details = getSelectionDetails();
    if (!details || !settings.aiTextUseButton) {
      // Avoid removing button if we just clicked on the button itself
      const activeEl = document.activeElement;
      if (activeBtnHost && activeBtnHost.contains(document.activeElement)) {
        return;
      }
      removeButton();
      return;
    }

    createOrPositionButton(details, true);
  }

  // Create button host and insert inside Shadow DOM
  function createOrPositionButton(details, useMouseCoords) {
    if (activeBtnHost) {
      positionButton(details, useMouseCoords);
      return;
    }

    const host = document.createElement('div');
    host.id = 'nina-ai-text-btn-host';
    host.style.cssText = 'all:initial; position:fixed; z-index:2147483647; pointer-events:auto;';
    
    const shadow = host.attachShadow({ mode: 'open' });

    // Styles
    const style = document.createElement('style');
    style.textContent = `
      .improver-btn {
        all: initial;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background-color: #1A1C1E;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 20px;
        padding: 6px 14px;
        color: #80D8DF;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
        user-select: none;
        pointer-events: auto;
      }
      .improver-btn:hover {
        background-color: #2D3133;
        border-color: #80D8DF;
        transform: translateY(-1px);
        box-shadow: 0 6px 20px rgba(128, 216, 223, 0.15), 0 4px 16px rgba(0, 0, 0, 0.4);
      }
      .improver-btn:active {
        transform: translateY(0) scale(0.97);
      }
      .improver-btn.loading {
        color: #CCE8EA;
        background-color: #004F54;
        border-color: #80D8DF;
        cursor: wait;
        pointer-events: none;
      }
      .improver-btn.success {
        color: #052e16;
        background-color: #86efac;
        border-color: #22c55e;
        cursor: default;
        pointer-events: none;
      }
      .improver-btn.error {
        color: #450a0a;
        background-color: #fca5a5;
        border-color: #ef4444;
        cursor: default;
        pointer-events: none;
      }
      .spinner {
        width: 12px;
        height: 12px;
        border: 2px solid rgba(128, 216, 223, 0.3);
        border-top: 2px solid #80D8DF;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        flex-shrink: 0;
      }
      .icon {
        flex-shrink: 0;
        width: 13px;
        height: 13px;
        fill: none;
        stroke: currentColor;
        stroke-width: 2.2;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    shadow.appendChild(style);

    const btn = document.createElement('button');
    btn.className = 'improver-btn';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" class="icon">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
      <span>Verbessern</span>
    `;

    // Prevent button click from losing focus of target text area
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
    });

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const currentDetails = getSelectionDetails();
      if (currentDetails) {
        triggerTextImprovement(currentDetails, btn);
      } else {
        removeButton();
      }
    });

    shadow.appendChild(btn);
    document.body.appendChild(host);
    activeBtnHost = host;

    positionButton(details, useMouseCoords);

    // Hide if user scrolls page
    window.addEventListener('scroll', removeButton, { passive: true });
  }

  // Position button above selection or near mouse release
  function positionButton(details, useMouseCoords) {
    if (!activeBtnHost) return;

    const btn = activeBtnHost.shadowRoot.querySelector('.improver-btn');
    const btnWidth = btn.offsetWidth || 110;
    const btnHeight = btn.offsetHeight || 32;

    let targetX = 0;
    let targetY = 0;

    // 1. Try to get selection range bounding box
    try {
      const sel = getSelectionObject(details.element);
      if (sel && sel.rangeCount > 0) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) {
          targetX = rect.left + rect.width / 2;
          targetY = rect.top;
        }
      }
    } catch (_) {}

    // 2. Fallback to mouse coordinates if requested
    if ((targetX <= 0 || targetY <= 0) && useMouseCoords) {
      targetX = lastMouseX;
      targetY = lastMouseY;
    }

    // 3. Last fallback: use active element bounding rect
    if (targetX <= 0 || targetY <= 0) {
      const elRect = details.element.getBoundingClientRect();
      targetX = elRect.left + elRect.width / 2;
      targetY = elRect.top;
    }

    // Adjust: center button horizontally over selection and raise it up
    let left = targetX - btnWidth / 2;
    let top = targetY - btnHeight - 8;

    // Viewport bounds checks
    if (left < 8) left = 8;
    if (left + btnWidth > window.innerWidth - 8) {
      left = window.innerWidth - btnWidth - 8;
    }
    if (top < 8) {
      top = targetY + 24; // Show below selection if top is offscreen
    }

    activeBtnHost.style.left = `${left}px`;
    activeBtnHost.style.top = `${top}px`;
  }

  // Remove floating button
  function removeButton() {
    if (activeBtnHost) {
      activeBtnHost.remove();
      activeBtnHost = null;
      window.removeEventListener('scroll', removeButton);
    }
  }

  // Trigger Gemini API Request and replace text
  function triggerTextImprovement(details, btnEl) {
    if (isImproving) return;
    isImproving = true;

    // Update floating button UI if present
    if (btnEl) {
      btnEl.className = 'improver-btn loading';
      btnEl.innerHTML = `<div class="spinner"></div><span>Verbessere...</span>`;
    }

    try {
      // Send message to background to fetch key and call Gemini API
      chrome.runtime.sendMessage(
        {
          type: 'NINA_IMPROVE_TEXT',
          text: details.text,
          settings: {
            aiTextSpelling: settings.aiTextSpelling,
            aiTextPunctuation: settings.aiTextPunctuation,
            aiTextCustomActive: settings.aiTextCustomActive,
            aiTextCustomPrompt: settings.aiTextCustomPrompt
          }
        },
        (response) => {
          isImproving = false;

          // Double check if context is still valid inside callback
          if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
            handleFailure(btnEl, 'Kontext wurde ungültig. Bitte Seite neu laden (F5).');
            return;
          }

          if (chrome.runtime.lastError) {
            handleFailure(btnEl, chrome.runtime.lastError.message);
            return;
          }

          if (response && response.success && response.text) {
            handleSuccess(details, response.text, btnEl);
          } else {
            const errorMsg = (response && response.error) ? response.error : 'Fehler bei der Anfrage.';
            handleFailure(btnEl, errorMsg);
          }
        }
      );
    } catch (err) {
      isImproving = false;
      handleFailure(btnEl, 'Kontext ungültig. Bitte Seite neu laden (F5).');
    }
  }

  // Success Handler
  function handleSuccess(details, newText, btnEl) {
    // Replace text in document
    replaceSelection(details, newText);

    if (btnEl) {
      btnEl.className = 'improver-btn success';
      btnEl.innerHTML = `
        <svg class="icon" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        <span>Verbessert!</span>
      `;
      setTimeout(removeButton, 1000);
    } else {
      showTemporaryFeedbackToast('✓ Text verbessert');
    }
  }

  // Failure Handler
  function handleFailure(btnEl, errorMsg) {
    console.error('NINA KI-Textverbesserung fehlgeschlagen:', errorMsg);
    
    if (btnEl) {
      btnEl.className = 'improver-btn error';
      btnEl.innerHTML = `
        <svg class="icon" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        <span>Fehler!</span>
      `;
      btnEl.title = errorMsg;
      setTimeout(removeButton, 3000);
    }
    
    showTemporaryFeedbackToast('✗ Fehler: ' + errorMsg, 4000);
  }

  // Replace selection text in inputs/textareas or contenteditables
  function replaceSelection(details, newText) {
    const el = details.element;
    el.focus();

    // 1. Try execCommand (preserves Undo history Ctrl+Z)
    try {
      if (details.isInput) {
        // execCommand requires focus and selection to be active
        el.setSelectionRange(details.start, details.end);
      }
      const success = document.execCommand('insertText', false, newText);
      if (success) {
        return;
      }
    } catch (_) {}

    // 2. Fallback: Manual replacement
    if (details.isInput) {
      const start = details.start;
      const end = details.end;
      const val = el.value;
      
      el.value = val.substring(0, start) + newText + val.substring(end);
      el.setSelectionRange(start + newText.length, start + newText.length);
      
      // Dispatch events so page frameworks update state
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      const sel = getSelectionObject(el);
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(newText));
        
        // Reset selection range to end of inserted text
        sel.removeAllRanges();
        const newRange = document.createRange();
        newRange.selectNodeContents(el);
        newRange.collapse(false);
        sel.addRange(newRange);
        
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }

  // Create temporary in-page feedback toast if button isn't visible (e.g. shortcut trigger)
  function showTemporaryFeedbackToast(message, duration = 2500) {
    const existing = document.getElementById('nina-ai-toast-feedback');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'nina-ai-toast-feedback';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(24px);
      background-color: #1A1C1E;
      border: 1px solid #80D8DF;
      border-radius: 20px;
      padding: 8px 18px;
      color: #80D8DF;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      font-weight: 700;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      z-index: 2147483647;
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      pointer-events: none;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
      
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(24px)';
        setTimeout(() => toast.remove(), 400);
      }, duration);
    });
  }

})();
