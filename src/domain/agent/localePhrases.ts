/**
 * Multilingual goal cues for the deterministic planner.
 * Do not rely on \\b word boundaries for Indic scripts — they only match ASCII.
 */

function includesAny(text: string, needles: readonly string[]): boolean {
  const lower = text.toLowerCase()
  return needles.some((needle) => lower.includes(needle.toLowerCase()))
}

const EMERGENCY = [
  "emergency",
  "ambulance",
  "chest pain",
  "इमरजेंसी",
  "आपातकाल",
  "एम्बुलेंस",
  "सीने में दर्द",
  "ਐਮਰਜੈਂਸੀ",
  "ایمرجنسی",
  "ایمبولینس",
  "জরুরি",
  "অ্যাম্বুলেন্স",
  "आपत्कालीन",
  "अॅम्ब्युलन्स",
  "அவசர",
  "ஆம்புலன்ஸ்",
  "అత్యవసర",
  "అంబులెన్స్",
  "ઇમરજન્સી",
  "એમ્બ્યુલન્સ",
] as const

const DIRECTIONS = [
  "where is",
  "directions",
  "how do i get",
  "how to get",
  "how to go",
  "take me to",
  "navigate",
  "nearest",
  "show me the route",
  "कहाँ है",
  "कहा है",
  "कहां है",
  "रास्ता",
  "दिशा",
  "कैसे जाऊं",
  "कैसे जाएँ",
  "कैसे पहुँचूँ",
  "ले चलो",
  "ਨੇੜੇ",
  "ਕਿੱਥੇ ਹੈ",
  "ਰਸਤਾ",
  "کہاں ہے",
  "راستہ",
  "কথায়",
  "কোথায়",
  "রাস্তা",
  "कुठे आहे",
  "मार्ग",
  "எங்கே",
  "வழி",
  "ఎక్కడ",
  "దారి",
  "ક્યાં છે",
  "રસ્તો",
] as const

const FACILITIES = [
  "washroom",
  "toilet",
  "restroom",
  "pharmacy",
  "laboratory",
  "lab",
  "billing",
  "cardiology",
  "radiology",
  "शौचालय",
  "टॉयलेट",
  "फार्मेसी",
  "दवा",
  "लैब",
  "प्रयोगशाला",
  "कार्डियोलॉजी",
  "हृदय",
  "ਟਾਇਲਟ",
  "ਫਾਰਮੇਸੀ",
  "لیب",
  "فارمیسی",
  "টয়লেট",
  "ফার্মেসি",
  "शौचालय",
  "फार्मसी",
  "கழிப்பறை",
  "மருந்தகம்",
  "టాయిలెట్",
  "ఫార్మసీ",
  "શૌચાલય",
  "ફાર્મસી",
] as const

const REGISTER = [
  "register me",
  "register myself",
  "how to register",
  "hospital registration",
  "create a slip",
  "new registration slip",
  "new token",
  "get a new token",
  "enroll",
  "sign me up",
  "रजिस्टर करो",
  "रजिस्टर करें",
  "मेरा पंजीकरण",
  "पंजीकरण करो",
  "पंजीकरण करें",
  "रजिस्ट्रेशन करो",
  "रजिस्ट्रेशन करें",
  "नया टोकन",
  "पर्ची बनाओ",
  "पर्ची बनाएं",
  "ਰਜਿਸਟਰ ਕਰੋ",
  "مجھے رجسٹر",
  "رجسٹریشن کرو",
  "নিবন্ধন করো",
  "नोंदणी करा",
  "என்னை பதிவு",
  "నన్ను నమోదు",
  "મને નોંધણી",
] as const

const RETRIEVE_SLIP = [
  "find my slip",
  "lost my slip",
  "lost my token",
  "existing slip",
  "retrieve",
  "मेरी पर्ची",
  "पर्ची खो",
  "टोकन खो",
  "पुरानी पर्ची",
  "ਪਰਚੀ ਗੁੰਮ",
  "پرچی گم",
  "স্লিপ হারিয়ে",
  "चिठ्ठी हरवली",
  "சீட்டு தொலை",
  "స్లిప్ పోయింది",
  "પર્ચી ખોવાઈ",
] as const

const QUEUE = [
  "how long",
  "how much longer",
  "my turn",
  "wait time",
  "queue",
  "patients ahead",
  "people ahead",
  "token number",
  "मेरी बारी",
  "कितना इंतजार",
  "कितनी देर",
  "वेटिंग",
  "इंतज़ार",
  "टोकन नंबर",
  "कितने मरीज",
  "ਮੇਰੀ ਵਾਰੀ",
  "میری باری",
  "কতক্ষণ",
  "माझी पाळी",
  "என் முறை",
  "నా వంతు",
  "મારી વારી",
] as const

const REPEAT = [
  "repeat",
  "say again",
  "once more",
  "फिर से बताओ",
  "दोबारा",
  "फिर से कहो",
  "ਫਿਰ ਦੱਸੋ",
  "دوبارہ",
  "আবার বলো",
  "पुन्हा सांगा",
  "மீண்டும்",
  "మళ్లీ చెప్పు",
  "ફરી કહો",
] as const

const FOLLOWUP_DIRECTIONS = [
  "where is it",
  "how do i get there",
  "which way",
  "take me there",
  "वहाँ कैसे",
  "वहां कैसे",
  "उधर कैसे",
  "वहाँ का रास्ता",
  "ਉੱਥੇ ਕਿਵੇਂ",
  "وہاں کیسے",
  "সেখানে কিভাবে",
  "तिथे कसे",
  "அங்கே எப்படி",
  "అక్కడ ఎలా",
  "ત્યાં કેવી રીતે",
] as const

const APP_HELP = [
  "what can you do",
  "how do i use",
  "app help",
  "तुम क्या कर सकते",
  "क्या मदद",
  "कैसे इस्तेमाल",
  "ਤੁਸੀਂ ਕੀ ਕਰ ਸਕਦੇ",
  "تم کیا کر سکتے",
  "তুমি কী করতে পারো",
  "तू काय करू शकतो",
  "நீ என்ன செய்ய முடியும்",
  "నువ్వు ఏమి చేయగలవు",
  "તમે શું કરી શકો",
] as const

const HELP_REQUEST = [
  "need help",
  "call for help",
  "staff help",
  "मदद चाहिए",
  "हेल्प चाहिए",
  "स्टाफ बुलाओ",
  "ਮਦਦ ਚਾਹੀਦੀ",
  "مدد چاہیے",
  "সাহায্য লাগে",
  "मदत हवी",
  "உதவி வேண்டும்",
  "సహాయం కావాలి",
  "મદદ જોઈએ",
] as const

const DEPARTMENTS_LIST = [
  "list the departments",
  "which departments",
  "available clinics",
  "विभागों की सूची",
  "कौन से विभाग",
  "ਵਿਭਾਗਾਂ ਦੀ ਸੂਚੀ",
  "محکموں کی فہرست",
  "বিভাগের তালিকা",
  "विभागांची यादी",
  "துறை பட்டியல்",
  "విభాగాల జాబితా",
  "વિભાગોની યાદી",
] as const

export function utteranceSuggestsEmergency(text: string): boolean {
  return includesAny(text, EMERGENCY)
}

export function utteranceSuggestsDirections(text: string): boolean {
  return includesAny(text, DIRECTIONS) || includesAny(text, FACILITIES)
}

export function utteranceSuggestsFacility(text: string): boolean {
  return includesAny(text, FACILITIES)
}

export function utteranceSuggestsRegister(text: string): boolean {
  return includesAny(text, REGISTER)
}

export function utteranceSuggestsRetrieveSlip(text: string): boolean {
  return includesAny(text, RETRIEVE_SLIP)
}

export function utteranceSuggestsQueue(text: string): boolean {
  return includesAny(text, QUEUE)
}

export function utteranceSuggestsRepeat(text: string): boolean {
  return includesAny(text, REPEAT)
}

export function utteranceSuggestsFollowupDirections(text: string): boolean {
  return includesAny(text, FOLLOWUP_DIRECTIONS)
}

export function utteranceSuggestsAppHelp(text: string): boolean {
  return includesAny(text, APP_HELP)
}

export function utteranceSuggestsHelpRequest(text: string): boolean {
  return includesAny(text, HELP_REQUEST)
}

export function utteranceSuggestsDepartmentsList(text: string): boolean {
  return includesAny(text, DEPARTMENTS_LIST)
}
