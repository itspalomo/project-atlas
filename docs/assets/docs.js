(function () {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    flowchart: {
      curve: "basis",
      padding: 18,
      htmlLabels: true
    },
    sequence: {
      mirrorActors: false,
      actorMargin: 72,
      messageMargin: 42
    },
    themeVariables: {
      background: "#fbfaf6",
      primaryColor: "#f3efe6",
      primaryTextColor: "#10201d",
      primaryBorderColor: "#1f6f68",
      lineColor: "#53736d",
      secondaryColor: "#e8f0ec",
      tertiaryColor: "#f9d57e",
      fontFamily: "Aptos, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      clusterBkg: "#fffdf7",
      clusterBorder: "#d7c9aa",
      edgeLabelBackground: "#fffdf7",
      noteBkgColor: "#fff4cf",
      noteTextColor: "#19241f",
      noteBorderColor: "#d9b45c"
    }
  });

  function escapeHtml(value) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  window.$docsify = window.$docsify || {};
  window.$docsify.markdown = window.$docsify.markdown || {};
  window.$docsify.markdown.renderer = {
    code: function (code, lang) {
      if (lang === "mermaid") {
        return '<div class="atlas-diagram mermaid">' + escapeHtml(code) + "</div>";
      }

      return this.origin.code.apply(this, arguments);
    }
  };

  window.$docsify.plugins = [].concat(window.$docsify.plugins || [], function (hook) {
    hook.doneEach(function () {
      mermaid.run({ querySelector: ".mermaid" });
    });
  });
})();
