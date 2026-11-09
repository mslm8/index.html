(function (document, window) {
  'use strict';

  const config = window.__POSTHOG_CONFIG__;
  if (!config || typeof config.token !== 'string' || !config.token.trim() ||
      typeof config.host !== 'string' ||
      !/^https:\/\/(eu|us)\.i\.posthog\.com$/.test(config.host)) {
    return;
  }

  // Official PostHog HTML bootstrap: initialize from deployment-injected
  // configuration; never place project credentials in committed source.
  !function (t, e) {
    var o, n, p, r;
    e.__SV || (window.posthog && window.posthog.__loaded) ||
      (window.posthog = e, e._i = [], e.init = function (i, s, a) {
        function g(t, e) {
          var o = e.split('.');
          2 === o.length && (t = t[o[0]], e = o[1]);
          t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))); };
        }
        p || ((p = t.createElement('script')).type = 'text/javascript',
          p.crossOrigin = 'anonymous', p.async = !0,
          p.src = s.api_host.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.js',
          p.onerror = function () { p = null; },
          (r = t.getElementsByTagName('script')[0]).parentNode.insertBefore(p, r));
        var u = e;
        void 0 !== a ? u = e[a] = [] : a = 'posthog';
        u.people = u.people || [];
        Object.defineProperty(u, 'toString', {
          configurable: !0, enumerable: !0, writable: !0,
          value: function (t) { var e = 'posthog'; return 'posthog' !== a && (e += '.' + a), t || (e += ' (stub)'), e; }
        });
        Object.defineProperty(u.people, 'toString', {
          configurable: !0, enumerable: !0, writable: !0,
          value: function () { return u.toString(1) + '.people (stub)'; }
        });
        o = 'init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagResult isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug'.split(' ');
        for (n = 0; n < o.length; n++) g(u, o[n]);
        e._i.push([i, s, a]);
      }, e.__SV = 1);
  }(document, window.posthog || []);

  window.posthog.init(config.token, {
    api_host: config.host,
    defaults: '2026-08-30',
    autocapture: false,
    capture_pageview: true,
    capture_pageleave: true,
    disable_session_recording: true
  });

  const eventsByControl = Object.freeze({
    'generate': 'image_generation_requested',
    'generateSceneBackground': 'scene_background_generation_requested',
    'generateAllSceneBackgrounds': 'episode_background_generation_requested',
    'storyToScenesButton': 'storyboard_generation_requested',
    'aiStoryEngineButton': 'episode_generation_requested',
    'download': 'image_downloaded',
    'downloadVideo': 'animation_downloaded',
    'saveNamedProject': 'project_saved',
    'exportProject': 'project_exported',
    'importProjectButton': 'project_import_started',
    'productionExportShots': 'shot_list_exported',
    'runManagerDiagnostics': 'diagnostics_run',
    'exportManagerReport': 'diagnostics_report_exported',
    'sendImageToAnimation': 'image_sent_to_animation',
    'addMotionScene': 'motion_scene_added',
    'duplicateMotionScene': 'motion_scene_duplicated',
    'deleteMotionScene': 'motion_scene_deleted'
  });
  const allowedEvents = new Set(Object.values(eventsByControl));

  function capture(eventName, controlId) {
    if (!allowedEvents.has(eventName) || typeof window.posthog.capture !== 'function') return false;
    window.posthog.capture(eventName, {
      app_name: 'AI Animator Studio',
      control_id: controlId || null
    });
    return true;
  }

  window.StudioAnalytics = Object.freeze({ capture: capture });

  document.addEventListener('click', function (event) {
    const target = event.target;
    const control = target && typeof target.closest === 'function'
      ? target.closest('button, a, [role="button"]')
      : null;
    if (!control) return;
    const eventName = eventsByControl[control.id];
    if (eventName) capture(eventName, control.id);
  }, true);

  function captureException(error, source) {
    if (typeof window.posthog.captureException !== 'function') return;
    window.posthog.captureException(error, {
      app_name: 'AI Animator Studio',
      source: source
    });
  }

  window.addEventListener('error', function (event) {
    const error = event && event.error instanceof Error
      ? event.error
      : new Error('Unhandled browser error');
    captureException(error, 'window.error');
  });

  window.addEventListener('unhandledrejection', function (event) {
    const error = event && event.reason instanceof Error
      ? event.reason
      : new Error('Unhandled promise rejection');
    captureException(error, 'unhandledrejection');
  });
})(document, window);
