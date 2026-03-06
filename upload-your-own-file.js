(() => {
  if (window.__uploadInitDone) {
    return;
  }
  window.__uploadInitDone = true;

  const buttons = document.querySelectorAll('.upload-stepper-btn[data-target][data-step]');

  buttons.forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();

      const input = document.getElementById(button.dataset.target);
      if (!input) {
        return;
      }

      const min = input.min !== '' ? Number(input.min) : -Infinity;
      let value = Number(input.value);

      if (!Number.isFinite(value)) {
        value = Number.isFinite(min) ? min : 0;
      }

      value = button.dataset.step === 'up' ? value + 1 : value - 1;

      if (Number.isFinite(min) && value < min) {
        value = min;
      }

      input.value = String(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  const fileInput = document.getElementById('upload-file');
  const dropzone = document.getElementById('upload-dropzone');
  const uploadForm = document.querySelector('.upload-form');

  if (fileInput && dropzone) {
    const emptyState = dropzone.querySelector('.upload-empty, .upload-dropzone-empty');
    const selectedState = dropzone.querySelector('.upload-selected');
    const fileName = dropzone.querySelector('.upload-card-name');
    const fileFormat = dropzone.querySelector('.upload-card-format');
    const fileSize = dropzone.querySelector('.upload-card-size');
    const removeBtn = dropzone.querySelector('.upload-remove, .upload-card-remove');
    let fileAddedTimer = 0;
    let fileRemoveTimer = 0;
    let fileClearedTimer = 0;
    let dragDepth = 0;

    const formatFileSize = (bytes) => {
      if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
      }

      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const clearAddedAnimation = () => {
      if (fileAddedTimer) {
        window.clearTimeout(fileAddedTimer);
        fileAddedTimer = 0;
      }
      dropzone.classList.remove('is-file-added');
    };

    const clearRemoveAnimation = () => {
      if (fileRemoveTimer) {
        window.clearTimeout(fileRemoveTimer);
        fileRemoveTimer = 0;
      }

      dropzone.classList.remove('is-file-removing');
      if (selectedState) {
        selectedState.classList.remove('is-closing');
      }
    };

    const triggerEmptyReveal = () => {
      if (fileClearedTimer) {
        window.clearTimeout(fileClearedTimer);
        fileClearedTimer = 0;
      }

      dropzone.classList.remove('is-file-cleared');
      void dropzone.offsetWidth;
      dropzone.classList.add('is-file-cleared');

      fileClearedTimer = window.setTimeout(() => {
        dropzone.classList.remove('is-file-cleared');
        fileClearedTimer = 0;
      }, 520);
    };

    const applyEmptyState = () => {
      dropzone.classList.remove('is-selected');
      dropzone.classList.remove('is-drag-over');
      clearAddedAnimation();
      clearRemoveAnimation();
      dragDepth = 0;

      if (emptyState) {
        emptyState.hidden = false;
      }

      if (selectedState) {
        selectedState.hidden = true;
      }

      if (fileName) {
        fileName.textContent = 'File name';
      }

      if (fileFormat) {
        fileFormat.textContent = 'File format';
      }

      if (fileSize) {
        fileSize.textContent = 'File size';
      }
    };

    const showEmpty = (options = {}) => {
      const shouldAnimate = Boolean(options.animate);
      const hasSelectedCard = dropzone.classList.contains('is-selected') && selectedState && !selectedState.hidden;

      if (!shouldAnimate || !hasSelectedCard) {
        applyEmptyState();
        return;
      }

      clearAddedAnimation();
      clearRemoveAnimation();
      dropzone.classList.remove('is-drag-over');
      dragDepth = 0;
      dropzone.classList.add('is-file-removing');
      selectedState.classList.add('is-closing');

      fileRemoveTimer = window.setTimeout(() => {
        applyEmptyState();
        triggerEmptyReveal();
        fileRemoveTimer = 0;
      }, 430);
    };

    const showSelected = (file) => {
      const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
      clearRemoveAnimation();
      if (fileClearedTimer) {
        window.clearTimeout(fileClearedTimer);
        fileClearedTimer = 0;
      }
      dropzone.classList.remove('is-file-cleared');
      dropzone.classList.remove('is-drag-over');
      dragDepth = 0;

      if (fileName) {
        fileName.textContent = file.name;
      }

      if (fileFormat) {
        fileFormat.textContent = ext.toUpperCase();
      }

      if (fileSize) {
        fileSize.textContent = formatFileSize(file.size);
      }

      if (emptyState) {
        emptyState.hidden = true;
      }

      if (selectedState) {
        selectedState.hidden = false;
      }

      dropzone.classList.add('is-selected');
      clearAddedAnimation();
      void dropzone.offsetWidth;
      dropzone.classList.add('is-file-added');
      fileAddedTimer = window.setTimeout(() => {
        dropzone.classList.remove('is-file-added');
        fileAddedTimer = 0;
      }, 760);
    };

    const hasFilePayload = (dataTransfer) => {
      if (!dataTransfer) {
        return false;
      }

      if (dataTransfer.types) {
        const types = Array.from(dataTransfer.types);
        if (types.indexOf('Files') !== -1) {
          return true;
        }
      }

      return Boolean(dataTransfer.files && dataTransfer.files.length);
    };

    const assignDroppedFile = (file) => {
      if (!file) {
        return false;
      }

      try {
        if (typeof DataTransfer !== 'undefined') {
          const transfer = new DataTransfer();
          transfer.items.add(file);
          fileInput.files = transfer.files;
          return true;
        }
      } catch (error) {
        return false;
      }

      return false;
    };

    const handleDroppedFile = (file) => {
      if (!file) {
        return;
      }

      const assigned = assignDroppedFile(file);
      if (assigned) {
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }

      showSelected(file);
    };

    fileInput.addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0] ? event.target.files[0] : null;

      if (!file) {
        showEmpty();
        return;
      }

      showSelected(file);
    });

    dropzone.addEventListener('dragenter', (event) => {
      if (!hasFilePayload(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      dragDepth += 1;
      dropzone.classList.add('is-drag-over');
    });

    dropzone.addEventListener('dragover', (event) => {
      if (!hasFilePayload(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
      dropzone.classList.add('is-drag-over');
    });

    dropzone.addEventListener('dragleave', (event) => {
      event.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) {
        dropzone.classList.remove('is-drag-over');
      }
    });

    dropzone.addEventListener('drop', (event) => {
      event.preventDefault();
      dragDepth = 0;
      dropzone.classList.remove('is-drag-over');

      if (!hasFilePayload(event.dataTransfer)) {
        return;
      }

      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]
        ? event.dataTransfer.files[0]
        : null;
      handleDroppedFile(file);
    });

    if (removeBtn) {
      removeBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        fileInput.value = '';
        showEmpty({ animate: true });
      });
    }

    showEmpty();
  }

  if (uploadForm) {
    const nameInput = document.getElementById('upload-name');
    const emailInput = document.getElementById('upload-email');
    const printRequestInput = document.getElementById('upload-print-request');
    const sizeInput = document.getElementById('upload-size');
    const materialSelect = document.getElementById('upload-material');
    const findModelLinkInput = document.getElementById('find-model-link');
    const findModelNameInput = document.getElementById('find-model-name');
    const findModelEmailInput = document.getElementById('find-model-email');
    const ideaConceptInput = document.getElementById('idea-concept');
    const ideaNameInput = document.getElementById('idea-name');
    const ideaEmailInput = document.getElementById('idea-email');
    const intendedUseBlock = uploadForm.querySelector('.upload-intended-use');
    const intendedUseInputs = Array.from(uploadForm.querySelectorAll('input[name="intended_use"]'));
    const dropWrap = uploadForm.querySelector('.upload-drop-wrap');
    const isUploadOwnFileForm = Boolean(
      nameInput && emailInput && printRequestInput && sizeInput && materialSelect
    );
    const isFindModelForm = Boolean(
      findModelLinkInput && findModelNameInput && findModelEmailInput
    );
    const isIdeaForm = Boolean(
      ideaConceptInput && ideaNameInput && ideaEmailInput
    );

    uploadForm.setAttribute('novalidate', 'novalidate');

    const ensureFieldError = (field) => {
      const fieldWrap = field.closest('.upload-field');
      if (!fieldWrap) {
        return null;
      }

      let errorElement = fieldWrap.querySelector('.upload-field-error');
      if (errorElement) {
        return errorElement;
      }

      errorElement = document.createElement('p');
      errorElement.className = 'upload-field-error';
      errorElement.setAttribute('aria-live', 'polite');
      fieldWrap.appendChild(errorElement);
      return errorElement;
    };

    const ensureIntendedError = () => {
      if (!intendedUseBlock) {
        return null;
      }

      let errorElement = intendedUseBlock.querySelector('.upload-intended-error');
      if (errorElement) {
        return errorElement;
      }

      errorElement = document.createElement('p');
      errorElement.className = 'upload-intended-error';
      errorElement.setAttribute('aria-live', 'polite');
      intendedUseBlock.appendChild(errorElement);
      return errorElement;
    };

    const ensureDropError = () => {
      if (!dropWrap) {
        return null;
      }

      let errorElement = dropWrap.querySelector('.upload-drop-error');
      if (errorElement) {
        return errorElement;
      }

      errorElement = document.createElement('p');
      errorElement.className = 'upload-drop-error';
      errorElement.setAttribute('aria-live', 'polite');
      dropWrap.appendChild(errorElement);
      return errorElement;
    };

    const getFieldErrorMessage = (field) => {
      const value = (field.value || '').trim();
      if (!value) {
        return 'Please fill out this field.';
      }

      if (field.type === 'email') {
        const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
        if (!isValidEmail) {
          return 'Please enter a valid email address.';
        }
      }

      if (field.tagName === 'SELECT' && !field.value) {
        return 'Please choose an option.';
      }

      if (!field.checkValidity()) {
        return 'Please check this field.';
      }

      return '';
    };

    const validateField = (field) => {
      if (!field) {
        return true;
      }

      const fieldWrap = field.closest('.upload-field');
      if (!fieldWrap) {
        return true;
      }

      const errorElement = ensureFieldError(field);
      const errorMessage = getFieldErrorMessage(field);
      const isValid = !errorMessage;

      fieldWrap.classList.toggle('is-invalid', !isValid);
      field.setAttribute('aria-invalid', isValid ? 'false' : 'true');
      if (errorElement) {
        errorElement.textContent = errorMessage;
      }

      return isValid;
    };

    const validateIntendedUse = () => {
      if (!intendedUseBlock || !intendedUseInputs.length) {
        return true;
      }

      const errorElement = ensureIntendedError();
      const hasSelection = intendedUseInputs.some((input) => input.checked);

      intendedUseBlock.classList.toggle('is-invalid', !hasSelection);
      if (errorElement) {
        errorElement.textContent = hasSelection ? '' : 'Please choose an option.';
      }

      return hasSelection;
    };

    const validateDropzone = () => {
      if (!dropWrap || !fileInput) {
        return true;
      }

      const errorElement = ensureDropError();
      const hasFile = !!(fileInput.files && fileInput.files.length);

      dropWrap.classList.toggle('is-invalid', !hasFile);
      if (errorElement) {
        errorElement.textContent = hasFile ? '' : 'Please upload a file.';
      }

      return hasFile;
    };

    const resolveFocusableTarget = (element) => {
      if (!element) {
        return null;
      }

      if (
        typeof element.focus === 'function' &&
        /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/i.test(element.tagName || '')
      ) {
        return element;
      }

      const nestedFocusable = element.querySelector(
        'input, textarea, select, button, a[href], [tabindex]:not([tabindex="-1"])'
      );
      return nestedFocusable || null;
    };

    const easeInOutCubic = (value) => {
      if (value < 0.5) {
        return 4 * value * value * value;
      }
      return 1 - Math.pow(-2 * value + 2, 3) / 2;
    };

    const smoothScrollToElement = (element, durationMs) => {
      if (!element) {
        return;
      }

      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const pageHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      );
      const rect = element.getBoundingClientRect();
      const startY = window.scrollY || window.pageYOffset || 0;
      const centeredY = startY + rect.top - (viewportHeight / 2 - rect.height / 2);
      const maxScrollY = Math.max(0, pageHeight - viewportHeight);
      const targetY = Math.min(Math.max(0, centeredY), maxScrollY);
      const distance = targetY - startY;

      if (Math.abs(distance) < 1) {
        return;
      }

      const startTime = performance.now();

      const frame = (now) => {
        const elapsed = now - startTime;
        let progress = elapsed / durationMs;
        if (progress > 1) {
          progress = 1;
        }

        const eased = easeInOutCubic(progress);
        window.scrollTo(0, startY + distance * eased);

        if (progress < 1) {
          window.requestAnimationFrame(frame);
        }
      };

      window.requestAnimationFrame(frame);
    };

    const focusWithSmoothScroll = (element) => {
      if (!element) {
        return;
      }

      const prefersReducedMotion =
        window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const focusTarget = resolveFocusableTarget(element);
      let focusedWithoutScroll = false;
      const invalidScrollDurationMs = 1176;

      if (focusTarget && typeof focusTarget.focus === 'function') {
        try {
          focusTarget.focus({ preventScroll: true });
          focusedWithoutScroll = true;
        } catch (error) {
          focusedWithoutScroll = false;
        }
      }

      if (prefersReducedMotion) {
        if (typeof element.scrollIntoView === 'function') {
          element.scrollIntoView({
            behavior: 'auto',
            block: 'center'
          });
        }
      } else {
        smoothScrollToElement(element, invalidScrollDurationMs);
      }

      if (!focusedWithoutScroll && focusTarget && typeof focusTarget.focus === 'function') {
        window.setTimeout(() => {
          focusTarget.focus();
        }, prefersReducedMotion ? 0 : 320);
      }
    };

    const attachFieldValidation = (fields) => {
      fields.forEach((field) => {
        ensureFieldError(field);
        const update = () => {
          validateField(field);
        };
        field.addEventListener('blur', update);
        field.addEventListener('input', update);
        field.addEventListener('change', update);
      });
    };

    if (isUploadOwnFileForm) {
      const requiredFields = [
        nameInput,
        emailInput,
        printRequestInput,
        sizeInput,
        materialSelect
      ].filter(Boolean);

      attachFieldValidation(requiredFields);

      if (intendedUseInputs.length) {
        ensureIntendedError();
        intendedUseInputs.forEach((input) => {
          input.addEventListener('change', validateIntendedUse);
        });
      }

      if (dropWrap && fileInput) {
        ensureDropError();
        fileInput.addEventListener('change', validateDropzone);
      }

      uploadForm.addEventListener('submit', (event) => {
        let firstInvalidElement = null;

        const fileOk = validateDropzone();
        if (!fileOk && !firstInvalidElement) {
          firstInvalidElement = dropzone || fileInput;
        }

        requiredFields.forEach((field) => {
          const ok = validateField(field);
          if (!ok && !firstInvalidElement) {
            firstInvalidElement = field;
          }
        });

        const intendedOk = validateIntendedUse();
        if (!intendedOk && !firstInvalidElement) {
          firstInvalidElement = intendedUseBlock;
        }

        if (firstInvalidElement) {
          event.preventDefault();
          focusWithSmoothScroll(firstInvalidElement);
        }
      });
    }

    if (isFindModelForm) {
      const requiredFields = [
        findModelLinkInput,
        findModelNameInput,
        findModelEmailInput
      ].filter(Boolean);

      attachFieldValidation(requiredFields);

      uploadForm.addEventListener('submit', (event) => {
        let firstInvalidElement = null;

        requiredFields.forEach((field) => {
          const ok = validateField(field);
          if (!ok && !firstInvalidElement) {
            firstInvalidElement = field;
          }
        });

        if (firstInvalidElement) {
          event.preventDefault();
          focusWithSmoothScroll(firstInvalidElement);
        }
      });
    }

    if (isIdeaForm) {
      const requiredFields = [
        ideaConceptInput,
        ideaNameInput,
        ideaEmailInput
      ].filter(Boolean);

      attachFieldValidation(requiredFields);

      uploadForm.addEventListener('submit', (event) => {
        let firstInvalidElement = null;

        requiredFields.forEach((field) => {
          const ok = validateField(field);
          if (!ok && !firstInvalidElement) {
            firstInvalidElement = field;
          }
        });

        if (firstInvalidElement) {
          event.preventDefault();
          focusWithSmoothScroll(firstInvalidElement);
        }
      });
    }
  }

  const ideaConcept = document.getElementById('idea-concept');
  const mentionButtons = document.querySelectorAll('.idea-chip[data-insert-label]');

  if (ideaConcept && mentionButtons.length) {
    mentionButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const label = button.dataset.insertLabel;
        if (!label) {
          return;
        }

        const marker = `${label}:`;
        if (ideaConcept.value.includes(marker)) {
          return;
        }

        let prefix = '';
        if (ideaConcept.value.length === 0) {
          prefix = '';
        } else if (/\r?\n$/.test(ideaConcept.value)) {
          prefix = '\n';
        } else {
          prefix = '\n\n';
        }

        const insertion = `${prefix}${marker}`;
        ideaConcept.value += insertion;
        ideaConcept.focus();

        const caretPosition = ideaConcept.value.length;
        ideaConcept.setSelectionRange(caretPosition, caretPosition);
      });
    });
  }
})();
