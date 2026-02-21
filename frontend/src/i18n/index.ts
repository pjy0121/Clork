import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en/translation.json';
import ko from './locales/ko/translation.json';

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: en },
            ko: { translation: ko },
        },
        // We will sync this with Zustand via localStorage
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false, // React already safeguards from xss
        },
    });

export default i18n;
