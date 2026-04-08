/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import HomeV2 from './pages/HomeV2';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "HomeV2": HomeV2,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "HomeV2",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import AccessCodes from './pages/AccessCodes';
import AppleCoreApp from './pages/AppleCoreApp';
import AppleMusic from './pages/AppleMusic';
import Auth from './pages/Auth';
import Career from './pages/Career';
import EraManagementApp from './pages/EraManagementApp';
import Events from './pages/Events';
import MerchApp from './pages/MerchApp';
import Onboarding from './pages/Onboarding';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import Social from './pages/Social';
import SoundburstApp from './pages/SoundburstApp';
import StreamifyApp from './pages/StreamifyApp';
import Studio from './pages/Studio';
import TouringAppV2 from './pages/TouringAppV2';
import ChartsApp from './pages/ChartsApp';
import FandomApp from './pages/FandomApp';
import AmplifiApp from './pages/AmplifiApp';
import BrandPortfolioApp from './pages/BrandPortfolioApp';
import HomeV2 from './pages/HomeV2';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AccessCodes": AccessCodes,
    "AppleCoreApp": AppleCoreApp,
    "AppleMusic": AppleMusic,
    "Auth": Auth,
    "Career": Career,
    "ChartsApp": ChartsApp,
    "EraManagementApp": EraManagementApp,
    "FandomApp": FandomApp,
    "Events": Events,
    "MerchApp": MerchApp,
    "Onboarding": Onboarding,
    "Profile": Profile,
    "Settings": Settings,
    "Social": Social,
    "SoundburstApp": SoundburstApp,
    "StreamifyApp": StreamifyApp,
    "Studio": Studio,
    "TouringAppV2": TouringAppV2,
    "AmplifiApp": AmplifiApp,
    "BrandPortfolioApp": BrandPortfolioApp,
    "HomeV2": HomeV2,
}

export const pagesConfig = {
    mainPage: "HomeV2",
    Pages: PAGES,
    Layout: __Layout,
};
