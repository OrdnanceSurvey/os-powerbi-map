import Templates from "./templates";
import { fetchGSSDescriptions } from '../utils/getGSSInfo';
export default function createLandingPageContent(
  allowClose,
  closeButtonCallback: Function,
  launchButtonCallback: Function,
  copyCallback: Function
): HTMLElement {
  const closeButton: HTMLElement = document.createElement("div");
  const landingPageContent: HTMLElement = document.createElement("div");
  const banner: HTMLElement = document.createElement("div"); 
  const header: HTMLElement = document.createElement("div"); 
  const docsPlusLogo: HTMLElement = document.createElement("div");
  const contentContainer: HTMLElement = document.createElement("div");
  landingPageContent.className = "landing-page";
  contentContainer.className = "landing-page__content";
  header.className = "landing-page__header"
  docsPlusLogo.className = "landing-page__docs-logo-container"
  contentContainer.innerHTML = Templates.GettingStarted();

  closeButton.innerHTML = Templates.CloseButton;
  // @ts-ignore
  closeButton.addEventListener("click", closeButtonCallback);
  banner.innerHTML = Templates.Banner; 
  docsPlusLogo.innerHTML = Templates.DocsButton + Templates.Logo;
  
  header.innerHTML= Templates.Title
  header.appendChild(docsPlusLogo)
  banner.className = "landing-page__usage-terms"
  


  document.addEventListener('click', (event) => {
      const button = event.target as HTMLElement;
      if (button.classList.contains('apikey-button')) {
        launchButtonCallback("https://osdatahub.os.uk/products/")
      } else if (button.classList.contains('docs-button')) {
        launchButtonCallback("https://docs.os.uk/os-downloads/visualisation-products/os-maps-for-power-bi-visual-beta-product/os-maps-for-power-bi-visual-getting-started-guide")
      }
      else if (button.classList.contains('public-viewing-terms')) {
        launchButtonCallback("https://labs.os.uk/licensing/public-viewing-terms.pdf")
      } else if (button.classList.contains('report-bug')) {
        launchButtonCallback("https://github.com/OrdnanceSurvey/os-powerbi-map/issues")
      } else if (button.classList.contains('ireland-mapping')) {
        launchButtonCallback("https://www.ordnancesurvey.co.uk/blog/whats-the-difference-between-uk-britain-and-british-isles")
      } else if (button.classList.contains('licence-agreement')) {
        launchButtonCallback("https://www.ordnancesurvey.co.uk/documents/licences/OS-PowerBI-Visual.pdf")
      } else if (button.classList.contains('landing-page__copy-button')) {copyCallback(button);
      }
  });


  async function displayGSSPrefixes() {
    const prefixes = await fetchGSSDescriptions();
    const tbody = document.getElementById('gss-codes-body');
    tbody.innerHTML = ''; // Clear any existing rows

    prefixes.forEach(entityObj => {
        const row = document.createElement('tr');
        const boundaryCell = document.createElement('td');
        const prefixCell = document.createElement('td');

        boundaryCell.classList.add("table-container--first-col")
        boundaryCell.textContent = entityObj.Entity;
        prefixCell.textContent = entityObj.Prefixes.join(', ');

        row.appendChild(boundaryCell);
        row.appendChild(prefixCell);
        tbody.appendChild(row);
    });
}

displayGSSPrefixes();

  if (allowClose) {
    landingPageContent.appendChild(closeButton);
  }
  const findInfoAgain = document.createElement("div");
  findInfoAgain.setAttribute("class", "landing-page__find-info")
  findInfoAgain.innerHTML = Templates.Intro;
  landingPageContent.appendChild(banner);
  landingPageContent.appendChild(header);
  landingPageContent.appendChild(contentContainer);
  landingPageContent.appendChild(findInfoAgain)

  return landingPageContent;
}

