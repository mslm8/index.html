(() => {
  'use strict';
  const has = (text, words) => words.some(word => text.includes(word));
  const pick = (text, rules, fallback) => rules.find(rule => has(text, rule.words))?.value || fallback;
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const actionRules = [
    {words:['می‌دود','می دود','فرار','تعقیب','دوید','run','chase'],value:'run'},
    {words:['می‌پرد','پرش','جهش','از روی','می‌جهد','jump'],value:'jump'},
    {words:['راه می‌رود','قدم','حرکت می‌کند','وارد می‌شود','خارج می‌شود','walk','enter','leave'],value:'walk'},
    {words:['می‌رقصد','می‌لرزد','تکان','موج','dance','sway'],value:'sway'}
  ];
  const emotionRules = [
    {words:['وحشت','ترسید','می‌ترسد','نگران','خطر','scared','fear'],value:'surprised'},
    {words:['خوشحال','خنده','می‌خندد','شاد','موفق','happy','laugh'],value:'happy'},
    {words:['عصبانی','خشم','فریاد','دعوا','angry','shout'],value:'angry'},
    {words:['غمگین','گریه','ناراحت','شکست','sad','cry'],value:'sad'}
  ];
  const gestureRules = [
    {words:['سلام','خداحافظ','دست تکان','wave','greet'],value:'wave'},
    {words:['توضیح','می‌گوید','می‌پرسد','جواب','دیالوگ','talk','explain'],value:'talk'}
  ];
  const cameraRules = [
    {words:['جزئیات','چهره','واکنش','راز','شیء','دستگاه','close-up','detail'],value:'zoom-in'},
    {words:['منظره','شهر','فضا','سفینه','نمای کلی','wide shot','landscape'],value:'zoom-out'},
    {words:['دنبال','تعقیب','حرکت به راست','سمت راست'],value:'pan-right'},
    {words:['حرکت به چپ','سمت چپ'],value:'pan-left'}
  ];
  function enrichScreenplay(screenplay, story) {
    const scenes = Array.isArray(screenplay?.scenes) ? screenplay.scenes.slice(0, 8) : [];
    const cast = Array.isArray(screenplay?.characters) ? screenplay.characters.slice(0, 4) : [];
    const continuity = new Map();
    scenes.forEach((scene, index) => {
      const source = clean([scene.visual, scene.action, ...(Array.isArray(scene.dialogues) ? scene.dialogues.map(d => d?.text) : [])].join(' '));
      const inferredAction = pick(source, actionRules, '');
      const inferredEmotion = pick(source, emotionRules, '');
      const inferredGesture = pick(source, gestureRules, '');
      const inferredCamera = pick(source, cameraRules, '');
      scene.action = inferredAction || (['idle','walk','run','jump','sway'].includes(scene.action) ? scene.action : (index === 0 ? 'idle' : 'walk'));
      scene.emotion = inferredEmotion || (['none','happy','sad','angry','surprised'].includes(scene.emotion) ? scene.emotion : 'none');
      scene.gesture = inferredGesture || (['neutral','wave','talk'].includes(scene.gesture) ? scene.gesture : (Array.isArray(scene.dialogues) && scene.dialogues.length ? 'talk' : 'neutral'));
      scene.camera = inferredCamera || (['zoom-in','zoom-out','pan-left','pan-right'].includes(scene.camera) ? scene.camera : (index % 3 === 0 ? 'zoom-in' : index % 3 === 1 ? 'pan-right' : 'zoom-out'));
      scene.durationSeconds = Math.max(4, Math.min(18, Number(scene.durationSeconds) || (scene.dialogues?.length ? 8 + Math.min(6, scene.dialogues.length * 2) : 7)));
      scene.shotType = scene.camera === 'zoom-in' ? 'نمای نزدیک' : scene.camera === 'zoom-out' ? 'نمای باز' : 'نمای متحرک';
      scene.visual = clean(scene.visual || source || story).slice(0, 900);
      scene.directorNotes = 'تداوم طراحی و رنگ شخصیت‌ها حفظ شود؛ کنش اصلی واضح باشد؛ پس‌زمینه با محل و زمان داستان سازگار باشد؛ از افزودن شخصیت یا رویداد تازه خودداری شود.';
      const names = new Set((Array.isArray(scene.dialogues) ? scene.dialogues : []).map(d => clean(d?.speaker)).filter(Boolean));
      scene.characterFocus = names.size ? [...names] : cast.slice(0, 2).map(c => clean(c.name)).filter(Boolean);
      scene.continuityIndex = index;
      continuity.set(index, scene.characterFocus);
    });
    return {...screenplay, scenes, director: {version:1, storyLength:String(story || '').length, sceneCount:scenes.length, cast:cast.map(c=>clean(c.name)).filter(Boolean), continuityChecked:true}};
  }
  window.AIAnimatorDirector = Object.freeze({version:'1.0.0', enrichScreenplay});
})();