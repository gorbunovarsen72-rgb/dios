"use strict";

(function () {
  function initPageTransitions() {
    var body = document.body;
    if (!body || window.__daPageTransitionsBound) {
      return;
    }
    window.__daPageTransitionsBound = true;

    var prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      body.classList.remove("page-is-leaving");
      return;
    }

    var LEAVE_DURATION_MS = 680;
    var isLeaving = false;
    var isSoftNavigating = false;
    var canSoftNavigate =
      typeof window.fetch === "function" &&
      typeof window.DOMParser === "function" &&
      window.history &&
      typeof window.history.pushState === "function";

    function startLeaveTransition(onComplete) {
      if (isLeaving || isSoftNavigating) {
        return;
      }

      isLeaving = true;
      body.classList.add("page-is-leaving");

      window.setTimeout(function () {
        onComplete();
      }, LEAVE_DURATION_MS);
    }

    function finishTransition() {
      isLeaving = false;
      isSoftNavigating = false;
      body.classList.remove("page-is-leaving");
    }

    function hardNavigate(url, replace) {
      if (replace) {
        window.location.replace(url);
        return;
      }
      window.location.assign(url);
    }

    function isModifiedClick(event) {
      return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    }

    function shouldSkipLinkTransition(anchor, targetUrl) {
      var hrefAttr = anchor.getAttribute("href") || "";
      var targetAttr = (anchor.getAttribute("target") || "").toLowerCase();

      if (!hrefAttr || hrefAttr.charAt(0) === "#") {
        return true;
      }

      if (/^\s*(mailto:|tel:|javascript:)/i.test(hrefAttr)) {
        return true;
      }

      if (anchor.hasAttribute("download")) {
        return true;
      }

      if (targetAttr && targetAttr !== "_self") {
        return true;
      }

      if (anchor.hasAttribute("data-no-page-transition")) {
        return true;
      }

      if (targetUrl.origin !== window.location.origin) {
        return true;
      }

      var isSamePath = targetUrl.pathname === window.location.pathname;
      var isSameSearch = targetUrl.search === window.location.search;
      if (isSamePath && isSameSearch && targetUrl.hash) {
        return true;
      }

      if (targetUrl.href === window.location.href) {
        return true;
      }

      return false;
    }

    function syncMenuActiveState(targetUrl) {
      var nav = document.querySelector(".site-nav");
      if (!nav) {
        return;
      }

      var links = Array.prototype.slice.call(nav.querySelectorAll("a"));
      if (!links.length) {
        return;
      }

      var path = new URL(targetUrl, window.location.href).pathname.toLowerCase();
      var targetPath = path.split("/").pop();

      var requestPrintChildPages = [
        "upload-your-own-file.html",
        "find-model-online.html",
        "i-have-an-idea.html",
        "request-submitted.html"
      ];
      var scheduleChildPages = ["session-booked.html"];

      var preferredHref = targetPath;
      if (requestPrintChildPages.indexOf(targetPath) !== -1) {
        preferredHref = "request-a-print.html";
      } else if (scheduleChildPages.indexOf(targetPath) !== -1) {
        preferredHref = "schedule-a-session.html";
      }

      var activeLink = links.find(function (link) {
        var href = (link.getAttribute("href") || "").toLowerCase();
        return href === preferredHref;
      });

      if (!activeLink) {
        activeLink = links.find(function (link) {
          var href = (link.getAttribute("href") || "").toLowerCase();
          return href && (
            path.endsWith("/" + href) ||
            path.endsWith("\\" + href) ||
            path.endsWith(href)
          );
        }) || links[0];
      }

      links.forEach(function (link) {
        link.classList.toggle("active", link === activeLink);
      });
    }

    function loadExternalScript(src) {
      return new Promise(function (resolve, reject) {
        var script = document.createElement("script");
        script.src = src;
        script.async = false;
        script.onload = function () {
          script.remove();
          resolve();
        };
        script.onerror = function () {
          script.remove();
          reject(new Error("Script load failed: " + src));
        };
        document.head.appendChild(script);
      });
    }

    function executeFetchedScripts(nextDoc, baseUrl) {
      var scripts = Array.prototype.slice.call(nextDoc.querySelectorAll("script"));
      var chain = Promise.resolve();

      scripts.forEach(function (script) {
        var src = script.getAttribute("src");

        if (src) {
          var resolvedSrc = new URL(src, baseUrl).href;

          if (/scroll-animations\.js(\?|#|$)/i.test(resolvedSrc)) {
            return;
          }

          chain = chain.then(function () {
            if (/upload-your-own-file\.js(\?|#|$)/i.test(resolvedSrc)) {
              window.__uploadInitDone = false;
            }
            return loadExternalScript(resolvedSrc);
          });
          return;
        }

        var code = script.textContent || "";
        if (!code.trim()) {
          return;
        }

        chain = chain.then(function () {
          var executeInline = new Function(code);
          executeInline();
        });
      });

      return chain;
    }

    function replacePageContent(nextDoc, targetUrl, pushToHistory) {
      var nextMain = nextDoc.querySelector("main");
      var currentMain = document.querySelector("main");
      if (!nextMain || !currentMain) {
        throw new Error("Main content not found for soft navigation.");
      }

      currentMain.replaceWith(nextMain);

      if (nextDoc.body) {
        body.className = nextDoc.body.className;
      }

      if (nextDoc.title) {
        document.title = nextDoc.title;
      }

      if (pushToHistory) {
        try {
          if (targetUrl !== window.location.href) {
            window.history.pushState({ softNavigation: true }, "", targetUrl);
          }
        } catch (error) {
          // Ignore history failures.
        }
      }

      syncMenuActiveState(targetUrl);

      window.scrollTo(0, 0);
    }

    function performSoftNavigation(url, pushToHistory, replaceOnFallback) {
      if (!canSoftNavigate) {
        hardNavigate(url, !!replaceOnFallback);
        return;
      }

      if (isSoftNavigating) {
        return;
      }

      isSoftNavigating = true;

      fetch(url, {
        method: "GET",
        credentials: "same-origin",
        headers: {
          "X-Requested-With": "soft-navigation"
        }
      })
        .then(function (response) {
          var contentType = (response.headers.get("content-type") || "").toLowerCase();
          var isHtmlResponse = !contentType || contentType.indexOf("text/html") !== -1;

          if (!response.ok || !isHtmlResponse) {
            throw new Error("Failed to fetch HTML for soft navigation.");
          }

          return response.text();
        })
        .then(function (html) {
          var parser = new DOMParser();
          var nextDoc = parser.parseFromString(html, "text/html");

          replacePageContent(nextDoc, url, !!pushToHistory);

          return executeFetchedScripts(nextDoc, url)
            .catch(function (error) {
              console.warn("Soft navigation script init warning:", error);
            })
            .then(function () {
              finishTransition();

              try {
                initPageModules();
              } catch (error) {
                console.warn("Soft navigation module init warning:", error);
              }

              document.dispatchEvent(new CustomEvent("da:page-ready", { detail: { url: url } }));
            });
        })
        .catch(function () {
          finishTransition();
          hardNavigate(url, !!replaceOnFallback);
        });
    }

    body.classList.remove("page-is-leaving");

    document.addEventListener("click", function (event) {
      if (isLeaving || event.defaultPrevented || event.button !== 0 || isModifiedClick(event)) {
        return;
      }

      var target = event.target;
      if (!target || !target.closest) {
        return;
      }

      var anchor = target.closest("a[href]");
      if (!anchor) {
        return;
      }

      var targetUrl;
      try {
        targetUrl = new URL(anchor.href, window.location.href);
      } catch (error) {
        return;
      }

      if (shouldSkipLinkTransition(anchor, targetUrl)) {
        return;
      }

      event.preventDefault();
      startLeaveTransition(function () {
        performSoftNavigation(targetUrl.href, true, false);
      });
    });

    function handleFormSubmitTransition(event) {
      if (isLeaving || event.defaultPrevented) {
        return;
      }

      var form = event.target;
      if (!form || form.tagName !== "FORM") {
        return;
      }

      if (form.hasAttribute("data-no-page-transition")) {
        return;
      }

      var targetAttr = (form.getAttribute("target") || "").toLowerCase();
      if (targetAttr && targetAttr !== "_self") {
        return;
      }

      var method = (form.getAttribute("method") || "get").toLowerCase();
      if (method === "dialog") {
        return;
      }

      var actionAttr = form.getAttribute("action") || window.location.href;
      if (/^\s*(mailto:|tel:|javascript:)/i.test(actionAttr)) {
        return;
      }

      var actionUrl;
      try {
        actionUrl = new URL(actionAttr, window.location.href);
      } catch (error) {
        return;
      }

      if (actionUrl.origin !== window.location.origin) {
        return;
      }

      if (typeof form.checkValidity === "function" && !form.checkValidity()) {
        return;
      }

      if (event.defaultPrevented) {
        return;
      }

      if (method === "get" && canSoftNavigate) {
        var hasFileInput = !!form.querySelector('input[type="file"]');

        if (!hasFileInput) {
          event.preventDefault();

          var formData = new FormData(form);
          var params = new URLSearchParams();
          formData.forEach(function (value, key) {
            if (typeof File !== "undefined" && value instanceof File) {
              return;
            }
            params.append(key, value);
          });

          var submitUrl = new URL(actionUrl.href);
          submitUrl.search = params.toString();

          startLeaveTransition(function () {
            performSoftNavigation(submitUrl.href, true, false);
          });
          return;
        }
      }

      event.preventDefault();
      startLeaveTransition(function () {
        form.submit();
      });
    }

    document.addEventListener("submit", handleFormSubmitTransition);

    if (canSoftNavigate) {
      window.addEventListener("popstate", function () {
        if (isLeaving || isSoftNavigating) {
          return;
        }

        startLeaveTransition(function () {
          performSoftNavigation(window.location.href, false, true);
        });
      });
    }

    window.addEventListener("pageshow", function () {
      finishTransition();
    });
  }

  function initSocialLinks() {
    var footerLinks = [
      { href: "https://youtube.com", label: "YouTube" },
      { href: "https://discord.com", label: "Discord" },
      { href: "https://instagram.com", label: "Instagram" }
    ];

    var contactLinks = [
      { href: "https://instagram.com", label: "Instagram" },
      { href: "https://youtube.com", label: "YouTube" },
      { href: "https://discord.com", label: "Discord" }
    ];

    function upgradeIconLinks(containerSelector, linkMap) {
      var containers = document.querySelectorAll(containerSelector);

      containers.forEach(function (container) {
        var items = Array.prototype.slice.call(container.children);

        items.forEach(function (item, index) {
          var linkData = linkMap[index];
          if (!linkData) {
            return;
          }

          if (item.tagName === "A") {
            item.href = linkData.href;
            item.target = "_blank";
            item.rel = "noopener noreferrer";
            item.setAttribute("aria-label", linkData.label);
            return;
          }

          var anchor = document.createElement("a");
          anchor.className = item.className;
          anchor.href = linkData.href;
          anchor.target = "_blank";
          anchor.rel = "noopener noreferrer";
          anchor.setAttribute("aria-label", linkData.label);

          while (item.firstChild) {
            anchor.appendChild(item.firstChild);
          }

          container.replaceChild(anchor, item);
        });
      });
    }

    upgradeIconLinks(".footer-social", footerLinks);
    upgradeIconLinks(".contact-social-list", contactLinks);
  }

  function initMenuIndicatorAnimation() {
    var nav = document.querySelector(".site-nav");
    if (!nav) {
      return;
    }

    if (nav.dataset.menuIndicatorBound === "1") {
      return;
    }
    nav.dataset.menuIndicatorBound = "1";

    var links = Array.prototype.slice.call(nav.querySelectorAll("a"));
    if (!links.length) {
      return;
    }

    function resolveCurrentLink() {
      var activeLink = nav.querySelector("a.active");
      if (activeLink) {
        return activeLink;
      }

      var path = window.location.pathname.toLowerCase();
      var requestPrintChildPages = [
        "upload-your-own-file.html",
        "find-model-online.html",
        "i-have-an-idea.html",
        "request-submitted.html"
      ];
      var isRequestPrintChildPage = requestPrintChildPages.some(function (page) {
        return path.endsWith("/" + page) || path.endsWith("\\" + page) || path.endsWith(page);
      });

      if (isRequestPrintChildPage) {
        var requestPrintLink = links.find(function (link) {
          var href = (link.getAttribute("href") || "").toLowerCase();
          return href === "request-a-print.html";
        });

        if (requestPrintLink) {
          return requestPrintLink;
        }
      }

      var matchByPath = links.find(function (link) {
        var href = (link.getAttribute("href") || "").toLowerCase();
        return href && (path.endsWith("/" + href) || path.endsWith("\\" + href) || path.endsWith(href));
      });

      return matchByPath || links[0];
    }

    var currentLink = resolveCurrentLink();
    var indicator = document.createElement("span");
    var indicatorVisible = false;
    var displayedLink = currentLink;
    var isInteractive = false;
    var restoreTimer = 0;
    var TRANSITION_MS = 299;
    var baseline = null;

    if (window.getComputedStyle(nav).position === "static") {
      nav.style.position = "relative";
    }

    indicator.setAttribute("aria-hidden", "true");
    indicator.style.position = "absolute";
    indicator.style.pointerEvents = "none";
    indicator.style.opacity = "0";
    indicator.style.borderRadius = "6px";
    indicator.style.transition =
      "left 299ms ease, width 299ms ease, top 299ms ease, opacity 207ms ease";
    nav.appendChild(indicator);

    function readIndicatorStyle(link) {
      var pseudo = window.getComputedStyle(link, "::after");
      var lineHeight = parseFloat(pseudo.height);
      var bottomOffset = parseFloat(pseudo.bottom);
      var backgroundColor = pseudo.backgroundColor;

      return {
        height: Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 3,
        bottom: Number.isFinite(bottomOffset) ? bottomOffset : -4,
        color: backgroundColor && backgroundColor !== "rgba(0, 0, 0, 0)" ? backgroundColor : "#ff8d8d"
      };
    }

    function readBaseline(link) {
      var style = readIndicatorStyle(link);
      var linkTop = link.offsetTop;
      var linkHeight = link.offsetHeight;
      var top = linkTop + linkHeight - style.height - style.bottom;
      return {
        top: top,
        height: style.height,
        color: style.color
      };
    }

    function getGeometry(link, fixedBaseline) {
      var navWidth = nav.offsetWidth || 1;
      var navHeight = nav.offsetHeight || 1;
      var linkWidth = link.offsetWidth;
      var linkLeft = link.offsetLeft;
      var linkTop = link.offsetTop;
      var linkHeight = link.offsetHeight;
      var width = linkWidth * 0.7;
      var left = linkLeft + (linkWidth - width) / 2;
      var top = fixedBaseline ? fixedBaseline.top : linkTop + linkHeight - 4;

      return {
        left: left,
        leftPct: (left / navWidth) * 100,
        top: top,
        topPct: (top / navHeight) * 100,
        width: width,
        widthPct: (width / navWidth) * 100,
        height: fixedBaseline ? fixedBaseline.height : 3,
        color: fixedBaseline ? fixedBaseline.color : "#ff8d8d"
      };
    }

    function placeIndicator(link, show) {
      if (!link) {
        return;
      }

      var geometry = getGeometry(link, baseline);
      indicator.style.left = geometry.leftPct + "%";
      indicator.style.top = geometry.topPct + "%";
      indicator.style.width = geometry.widthPct + "%";
      indicator.style.height = geometry.height + "px";
      indicator.style.background = geometry.color;
      indicator.style.opacity = show ? "1" : "0";
      indicatorVisible = !!show;
      displayedLink = link;
    }

    function setNativeActive(link) {
      links.forEach(function (item) {
        item.classList.toggle("active", item === link);
      });
    }

    function beginInteractiveMode() {
      if (restoreTimer) {
        window.clearTimeout(restoreTimer);
        restoreTimer = 0;
      }

      if (isInteractive) {
        return;
      }

      baseline = readBaseline(currentLink);
      setNativeActive(null);
      placeIndicator(currentLink, true);
      isInteractive = true;
    }

    function animateTo(link) {
      if (!link) {
        return;
      }

      if (!isInteractive) {
        beginInteractiveMode();
      }

      placeIndicator(displayedLink, true);
      requestAnimationFrame(function () {
        placeIndicator(link, true);
      });
    }

    function restoreToActive() {
      if (!isInteractive) {
        return;
      }

      animateTo(currentLink);

      if (restoreTimer) {
        window.clearTimeout(restoreTimer);
      }

      restoreTimer = window.setTimeout(function () {
        if (!isInteractive) {
          return;
        }

        indicator.style.opacity = "0";
        indicatorVisible = false;
        setNativeActive(currentLink);
        displayedLink = currentLink;
        isInteractive = false;
        restoreTimer = 0;
      }, TRANSITION_MS);
    }

    baseline = readBaseline(currentLink);
    setNativeActive(currentLink);

    links.forEach(function (link) {
      link.addEventListener("mouseenter", function () {
        animateTo(link);
      });

      link.addEventListener("focus", function () {
        animateTo(link);
      });

      link.addEventListener("click", function () {
        currentLink = link;
        baseline = readBaseline(currentLink);
        isInteractive = false;
        setNativeActive(currentLink);
        indicator.style.opacity = "0";
        indicatorVisible = false;
        displayedLink = currentLink;
        if (restoreTimer) {
          window.clearTimeout(restoreTimer);
          restoreTimer = 0;
        }
      });
    });

    nav.addEventListener("mouseleave", function () {
      restoreToActive();
    });

    nav.addEventListener("focusout", function (event) {
      if (nav.contains(event.relatedTarget)) {
        return;
      }
      restoreToActive();
    });

    window.addEventListener("resize", function () {
      baseline = readBaseline(currentLink);

      if (isInteractive && displayedLink) {
        placeIndicator(displayedLink, true);
      }
    });

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", function () {
        baseline = readBaseline(currentLink);

        if (isInteractive && displayedLink) {
          placeIndicator(displayedLink, true);
        }
      });
    }

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        baseline = readBaseline(currentLink);

        if (isInteractive && displayedLink) {
          placeIndicator(displayedLink, true);
        }
      });
    }
  }

  function initContactFormValidation() {
    var contactForm = document.querySelector(".contact-form");
    if (!contactForm) {
      return;
    }

    if (contactForm.dataset.validationBound === "1") {
      return;
    }
    contactForm.dataset.validationBound = "1";

    var fields = Array.prototype.slice.call(
      contactForm.querySelectorAll("input[name], textarea[name], select[name]")
    );

    if (!fields.length) {
      return;
    }

    contactForm.setAttribute("novalidate", "novalidate");

    function ensureErrorElement(field) {
      var fieldWrap = field.closest(".contact-field");
      if (!fieldWrap) {
        return null;
      }

      var errorElement = fieldWrap.querySelector(".contact-field-error");
      if (errorElement) {
        return errorElement;
      }

      errorElement = document.createElement("p");
      errorElement.className = "contact-field-error";
      errorElement.setAttribute("aria-live", "polite");
      fieldWrap.appendChild(errorElement);
      return errorElement;
    }

    function getErrorMessage(field) {
      var value = (field.value || "").trim();
      if (!value) {
        return "Please fill out this field.";
      }

      if (field.type === "email") {
        var isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
        if (!isValidEmail) {
          return "Please enter a valid email address.";
        }
      }

      if (!field.checkValidity()) {
        return "Please check this field.";
      }

      return "";
    }

    function validateField(field) {
      var fieldWrap = field.closest(".contact-field");
      if (!fieldWrap) {
        return true;
      }

      var errorElement = ensureErrorElement(field);
      var errorMessage = getErrorMessage(field);
      var isValid = !errorMessage;

      fieldWrap.classList.toggle("is-invalid", !isValid);
      field.setAttribute("aria-invalid", isValid ? "false" : "true");

      if (errorElement) {
        errorElement.textContent = errorMessage;
      }

      return isValid;
    }

    function tryFocusWithoutScroll(field) {
      if (!field || typeof field.focus !== "function") {
        return false;
      }

      try {
        field.focus({ preventScroll: true });
        return true;
      } catch (error) {
        return false;
      }
    }

    function easeInOutCubic(value) {
      if (value < 0.5) {
        return 4 * value * value * value;
      }
      return 1 - Math.pow(-2 * value + 2, 3) / 2;
    }

    function smoothScrollToElement(element, durationMs) {
      if (!element) {
        return;
      }

      var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      var pageHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      );
      var rect = element.getBoundingClientRect();
      var startY = window.scrollY || window.pageYOffset || 0;
      var centeredY = startY + rect.top - (viewportHeight / 2 - rect.height / 2);
      var maxScrollY = Math.max(0, pageHeight - viewportHeight);
      var targetY = Math.min(Math.max(0, centeredY), maxScrollY);
      var distance = targetY - startY;

      if (Math.abs(distance) < 1) {
        return;
      }

      var startTime = performance.now();

      function frame(now) {
        var elapsed = now - startTime;
        var progress = elapsed / durationMs;
        if (progress > 1) {
          progress = 1;
        }

        var eased = easeInOutCubic(progress);
        window.scrollTo(0, startY + distance * eased);

        if (progress < 1) {
          window.requestAnimationFrame(frame);
        }
      }

      window.requestAnimationFrame(frame);
    }

    function focusFieldWithSmoothScroll(field) {
      if (!field) {
        return;
      }

      var prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      var focusedWithoutScroll = tryFocusWithoutScroll(field);
      var invalidScrollDurationMs = 1176;

      if (prefersReducedMotion) {
        if (typeof field.scrollIntoView === "function") {
          field.scrollIntoView({
            behavior: "auto",
            block: "center"
          });
        }
      } else {
        smoothScrollToElement(field, invalidScrollDurationMs);
      }

      if (!focusedWithoutScroll && typeof field.focus === "function") {
        window.setTimeout(function () {
          field.focus();
        }, prefersReducedMotion ? 0 : 320);
      }
    }

    fields.forEach(function (field) {
      ensureErrorElement(field);

      field.addEventListener("blur", function () {
        validateField(field);
      });

      field.addEventListener("input", function () {
        validateField(field);
      });
    });

    contactForm.addEventListener("submit", function (event) {
      var firstInvalidField = null;

      fields.forEach(function (field) {
        var isValid = validateField(field);
        if (!isValid && !firstInvalidField) {
          firstInvalidField = field;
        }
      });

      if (firstInvalidField) {
        event.preventDefault();
        focusFieldWithSmoothScroll(firstInvalidField);
      }
    });
  }

  function disableNativeValidationHints() {
    var subscribeForms = document.querySelectorAll(".footer-subscribe, .contact-subscribe");
    if (!subscribeForms.length) {
      return;
    }

    Array.prototype.slice.call(subscribeForms).forEach(function (form) {
      form.setAttribute("novalidate", "novalidate");
    });
  }

  function initSubscribeFormFeedback() {
    var subscribeForms = Array.prototype.slice.call(
      document.querySelectorAll(".footer-subscribe, .contact-subscribe")
    );
    if (!subscribeForms.length) {
      return;
    }

    var toastLayer = document.querySelector(".site-toast-layer");
    if (!toastLayer) {
      toastLayer = document.createElement("div");
      toastLayer.className = "site-toast-layer";
      document.body.appendChild(toastLayer);
    }

    var hideTimer = 0;

    function hideToast() {
      if (!toastLayer.firstChild) {
        return;
      }

      var currentToast = toastLayer.firstChild;
      currentToast.classList.remove("is-visible");
      window.setTimeout(function () {
        if (currentToast.parentNode === toastLayer) {
          toastLayer.removeChild(currentToast);
        }
      }, 260);
    }

    function showToast(message, type) {
      if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = 0;
      }

      while (toastLayer.firstChild) {
        toastLayer.removeChild(toastLayer.firstChild);
      }

      var toast = document.createElement("div");
      toast.className = "site-toast " + (type === "error" ? "is-error" : "is-success");
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      toast.textContent = message;
      toastLayer.appendChild(toast);

      requestAnimationFrame(function () {
        toast.classList.add("is-visible");
      });

      hideTimer = window.setTimeout(function () {
        hideToast();
        hideTimer = 0;
      }, 3200);
    }

    function isValidEmail(value) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
    }

    subscribeForms.forEach(function (form) {
      var emailInput = form.querySelector('input[type="email"]');
      if (!emailInput) {
        return;
      }

      if (form.dataset.subscribeBound === "1") {
        return;
      }
      form.dataset.subscribeBound = "1";

      form.setAttribute("novalidate", "novalidate");

      form.addEventListener("submit", function (event) {
        event.preventDefault();

        var value = (emailInput.value || "").trim();
        if (!value) {
          emailInput.setAttribute("aria-invalid", "true");
          showToast("Please enter your email address.", "error");
          emailInput.focus();
          return;
        }

        if (!isValidEmail(value)) {
          emailInput.setAttribute("aria-invalid", "true");
          showToast("Please enter a valid email address.", "error");
          emailInput.focus();
          return;
        }

        emailInput.setAttribute("aria-invalid", "false");
        showToast("Success! You are subscribed to our newsletter.", "success");
        form.reset();
      });

      emailInput.addEventListener("input", function () {
        emailInput.setAttribute("aria-invalid", "false");
      });
    });
  }

  function initScrollAnimations() {
    var observer = null;
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(onIntersect, {
        threshold: 0.2,
        rootMargin: "0px 0px -8% 0px"
      });
    }

    function onIntersect(entries, observerInstance) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) {
          return;
        }

        var target = entry.target;
        requestAnimationFrame(function () {
          target.classList.add("in-view");

          if (target._animateChildren && target._animateChildren.length) {
            target._animateChildren.forEach(function (child) {
              child.classList.add("in-view");
            });
          }
        });

        observerInstance.unobserve(target);
      });
    }

    function observeElement(element) {
      if (!element) {
        return;
      }

      if (observer) {
        observer.observe(element);
        return;
      }

      requestAnimationFrame(function () {
        element.classList.add("in-view");
        if (element._animateChildren && element._animateChildren.length) {
          element._animateChildren.forEach(function (child) {
            child.classList.add("in-view");
          });
        }
      });
    }

    function prepareElement(element, className, delay, duration) {
      if (!element) {
        return;
      }

      element.classList.add(className);
      if (typeof delay === "number") {
        element.style.setProperty("--anim-delay", delay + "ms");
      }
      if (typeof duration === "number") {
        element.style.setProperty("--anim-duration", duration + "ms");
      }
      observeElement(element);
    }

    function prepareElementOnLoad(element, className, delay, duration) {
      if (!element) {
        return;
      }

      element.classList.add(className);
      if (typeof delay === "number") {
        element.style.setProperty("--anim-delay", delay + "ms");
      }
      if (typeof duration === "number") {
        element.style.setProperty("--anim-duration", duration + "ms");
      }

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        element.classList.add("in-view");
        return;
      }

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          element.classList.add("in-view");
        });
      });
    }

    function findDirectChild(parent, selectors) {
      if (!parent) {
        return null;
      }

      var selectorList = Array.isArray(selectors) ? selectors : [selectors];
      var children = Array.prototype.slice.call(parent.children);

      for (var i = 0; i < children.length; i += 1) {
        var child = children[i];

        for (var j = 0; j < selectorList.length; j += 1) {
          if (child.matches(selectorList[j])) {
            return child;
          }
        }
      }

      return null;
    }

    function observePairBlock(container, visualElement, contentElement) {
      if (!container || !visualElement || !contentElement) {
        return;
      }

      var children = Array.prototype.slice.call(container.children);
      var visualIndex = children.indexOf(visualElement);
      var contentIndex = children.indexOf(contentElement);

      if (visualIndex === -1 || contentIndex === -1) {
        return;
      }

      var visualOnLeft = visualIndex < contentIndex;

      visualElement.classList.add(visualOnLeft ? "animate-left" : "animate-right");
      contentElement.classList.add(visualOnLeft ? "animate-right" : "animate-left");

      container._animateChildren = [visualElement, contentElement];
      observeElement(container);
    }

    function prepareLayoutPairs(layoutSelector, visualSelectors, contentSelectors) {
      var layouts = document.querySelectorAll(layoutSelector);

      layouts.forEach(function (layout) {
        var visualElement = findDirectChild(layout, visualSelectors);
        var contentElement = findDirectChild(layout, contentSelectors);

        observePairBlock(layout, visualElement, contentElement);
      });
    }

    function prepareLayoutPairsOnLoad(
      layoutSelector,
      visualSelectors,
      contentSelectors,
      visualDelay,
      contentDelay,
      visualDuration,
      contentDuration
    ) {
      var layouts = document.querySelectorAll(layoutSelector);

      layouts.forEach(function (layout) {
        var visualElement = findDirectChild(layout, visualSelectors);
        var contentElement = findDirectChild(layout, contentSelectors);

        if (!layout || !visualElement || !contentElement) {
          return;
        }

        var children = Array.prototype.slice.call(layout.children);
        var visualIndex = children.indexOf(visualElement);
        var contentIndex = children.indexOf(contentElement);

        if (visualIndex === -1 || contentIndex === -1) {
          return;
        }

        var visualOnLeft = visualIndex < contentIndex;
        var visualClass = visualOnLeft ? "animate-left" : "animate-right";
        var contentClass = visualOnLeft ? "animate-right" : "animate-left";
        var resolvedVisualDelay = typeof visualDelay === "number" ? visualDelay : 110;
        var resolvedContentDelay = typeof contentDelay === "number" ? contentDelay : 200;
        var resolvedVisualDuration = typeof visualDuration === "number" ? visualDuration : undefined;
        var resolvedContentDuration = typeof contentDuration === "number" ? contentDuration : undefined;

        var rect = layout.getBoundingClientRect();
        var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        var isVisibleOnLoad = rect.top < viewportHeight * 0.65 && rect.bottom > viewportHeight * 0.35;

        if (!isVisibleOnLoad) {
          visualElement.classList.add(visualClass);
          contentElement.classList.add(contentClass);

          visualElement.style.setProperty("--anim-delay", resolvedVisualDelay + "ms");
          contentElement.style.setProperty("--anim-delay", resolvedContentDelay + "ms");
          if (typeof resolvedVisualDuration === "number") {
            visualElement.style.setProperty("--anim-duration", resolvedVisualDuration + "ms");
          }
          if (typeof resolvedContentDuration === "number") {
            contentElement.style.setProperty("--anim-duration", resolvedContentDuration + "ms");
          }

          layout._animateChildren = [visualElement, contentElement];
          observeElement(layout);
          return;
        }

        prepareElementOnLoad(
          visualElement,
          visualClass,
          resolvedVisualDelay,
          resolvedVisualDuration
        );
        prepareElementOnLoad(
          contentElement,
          contentClass,
          resolvedContentDelay,
          resolvedContentDuration
        );
      });
    }

    function prepareGetInspiredPairs(layoutSelector, visualSelectors, contentSelector) {
      var layouts = document.querySelectorAll(layoutSelector);

      layouts.forEach(function (layout) {
        var visualElement = findDirectChild(layout, visualSelectors);
        var contentElement = findDirectChild(layout, contentSelector);

        if (!visualElement || !contentElement) {
          return;
        }

        var directChildren = Array.prototype.slice.call(layout.children);
        var visualIndex = directChildren.indexOf(visualElement);
        var contentIndex = directChildren.indexOf(contentElement);

        if (visualIndex === -1 || contentIndex === -1) {
          return;
        }

        var visualOnLeft = visualIndex < contentIndex;
        var visualClass = visualOnLeft ? "slide-left" : "slide-right";
        var contentClass = visualOnLeft ? "animate-right" : "animate-left";
        var animatedChildren = [visualElement, contentElement];

        visualElement.classList.add(visualClass);
        contentElement.classList.add(contentClass);

        var visualImages = visualElement.querySelectorAll("img");
        visualImages.forEach(function (image, imageIndex) {
          image.classList.add("fade-in");
          image.style.setProperty("--anim-delay", 120 + imageIndex * 70 + "ms");
          animatedChildren.push(image);
        });

        var contentBlocks = Array.prototype.slice.call(contentElement.children);
        contentBlocks.forEach(function (block, blockIndex) {
          // Keep CTA button hover behavior clean: do not mix entrance transform classes with hero-wave hover transform.
          if (block.classList && block.classList.contains("hero-wave")) {
            return;
          }
          block.classList.add(contentClass);
          block.style.setProperty("--anim-delay", 90 + blockIndex * 70 + "ms");
          animatedChildren.push(block);
        });

        layout._animateChildren = animatedChildren;
        observeElement(layout);
      });
    }

    function prepareHeroAnimations() {
      return;
    }

    function prepareHomeAnimations() {
      var howSection = document.querySelector(".how");
      var howRows = document.querySelectorAll(".how-row");
      var soonSection = document.querySelector(".soon .safe");

      prepareElement(howSection, "fade-in");
      prepareElement(soonSection, "fade-in");

      howRows.forEach(function (row) {
        var card = row.querySelector(".how-card");
        var text = row.querySelector(".how-text");

        if (!card || !text) {
          return;
        }

        var isCardOnLeft = row.firstElementChild === card;

        card.classList.add(isCardOnLeft ? "animate-left" : "animate-right");
        text.classList.add(isCardOnLeft ? "animate-right" : "animate-left");

        row._animateChildren = [card, text];
        observeElement(row);
      });
    }

    function prepareGetInspiredAnimations() {
      var consultingSections = document.querySelectorAll("section.consulting");

      consultingSections.forEach(function (section) {
        prepareElement(section, "fade-in");
      });

      prepareGetInspiredPairs(
        ".consulting-layout",
        [".consulting-image-wrap", ".consulting-guides-media"],
        ".consulting-content"
      );

      prepareGetInspiredPairs(
        ".custom-prints-layout",
        [".custom-prints-media", ".concept-projects-media"],
        ".custom-prints-content"
      );
    }

  function prepareAboutAnimations() {
    prepareElement(document.querySelector(".our-approach"), "fade-in");
    prepareElement(document.querySelector(".what-makes-different"), "fade-in");

    prepareElement(document.querySelector(".what-we-do-intro"), "fade-in");
    prepareElement(document.querySelector(".what-we-do-right"), "animate-right");

    prepareElement(document.querySelector(".our-approach-title"), "fade-in");
    prepareLayoutPairs(".our-approach-row", ".our-approach-card", ".our-approach-left");

    prepareElement(document.querySelector(".who-we-work-with-title"), "fade-in");
    prepareElement(document.querySelector(".who-we-work-with-cards"), "animate-left");
    prepareElement(document.querySelector(".who-we-work-with-guidance"), "animate-right");

    prepareElement(document.querySelector(".what-makes-different-intro"), "animate-left");
    prepareElement(document.querySelector(".what-makes-different-combines"), "fade-in");
    prepareElement(document.querySelector(".what-makes-different-outro"), "animate-right");
  }

  function prepareRequestPrintAnimations() {
    var isRequestPrintPage =
      /(^|[\\/])request-a-print\.html$/i.test(window.location.pathname) ||
      /request-a-print\.html$/i.test(window.location.href);
    if (isRequestPrintPage && document.body) {
      document.body.classList.add("request-print-page");
    }

    var nextSteps = document.querySelector(".next-steps .next-steps-inner");

    prepareElement(nextSteps, "fade-in", 80);
  }

  function prepareUploadOwnFileAnimations() {
    var isUploadPage =
      /(^|[\\/])upload-your-own-file\.html$/i.test(window.location.pathname) ||
      /upload-your-own-file\.html$/i.test(window.location.href);
    var isFindModelPage =
      /(^|[\\/])find-model-online\.html$/i.test(window.location.pathname) ||
      /find-model-online\.html$/i.test(window.location.href);
    var isIdeaPage =
      /(^|[\\/])i-have-an-idea\.html$/i.test(window.location.pathname) ||
      /i-have-an-idea\.html$/i.test(window.location.href);

    if (!isUploadPage && !isFindModelPage && !isIdeaPage) {
      return;
    }

    if (document.body) {
      document.body.classList.add("upload-own-file-page");
    }

    var orderedElements = [];

    function collect(selector) {
      var nodes = document.querySelectorAll(selector);
      nodes.forEach(function (node) {
        orderedElements.push(node);
      });
    }

    if (isUploadPage) {
      collect(".upload-step-details .upload-step-pill");
      collect(".upload-intro-fields .upload-field");
      collect(".upload-intended-use > h5");
      collect(".upload-use-options .upload-use-option");
      collect(".upload-paired-fields .upload-field");
      collect(".upload-details-content > .upload-block:last-child .upload-field");
      collect(".upload-actions-row");
    }

    if (isFindModelPage) {
      collect(".upload-step-details .upload-step-pill");
      collect(".request-form-groups > .upload-field");
      collect(".request-form-groups > .upload-fields-row:nth-of-type(1) .upload-field");
      collect(".request-form-groups > .upload-fields-row:nth-of-type(2) .upload-field");
      collect(".upload-actions-row");
    }

    if (isIdeaPage) {
      collect(".upload-step-details .upload-step-pill");
      collect(".idea-concept-content > .upload-field");
      collect(".idea-concept-content > .idea-mention");
      collect(".request-form-groups > .upload-fields-row:nth-of-type(1) .upload-field");
      collect(".request-form-groups > .upload-fields-row:nth-of-type(2) .upload-field");
      collect(".upload-actions-row");
    }

    orderedElements.forEach(function (element, index) {
      prepareElement(element, "animate-up", index * 55);
    });
  }

  function prepareContactAnimations() {
      var isContactPage = /(^|[\\/])contact\.html$/i.test(window.location.pathname) || /contact\.html$/i.test(window.location.href);

      if (isContactPage) {
        return;
      }

      prepareElement(document.querySelector(".contact-card"), "animate-left");
      prepareElement(document.querySelector(".contact-side"), "animate-right");
    }

    prepareHeroAnimations();
    prepareHomeAnimations();
    prepareGetInspiredAnimations();
    prepareAboutAnimations();
    prepareRequestPrintAnimations();
    prepareUploadOwnFileAnimations();
    prepareContactAnimations();
  }

  function initPageModules() {
    initSocialLinks();
    initMenuIndicatorAnimation();
    disableNativeValidationHints();
    initSubscribeFormFeedback();
    initContactFormValidation();
    initScrollAnimations();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      initPageTransitions();
      initPageModules();
    });
  } else {
    initPageTransitions();
    initPageModules();
  }
})();
