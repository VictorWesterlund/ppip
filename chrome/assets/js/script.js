/*
 * This function will be executed on the page where the extension was invoked.
 * It has to be self-contained as the function can not access properties outside
 * its own scope on runtime.
 */
function createImagePip(onClickedData) {
	const mod = import(`chrome-extension://${chrome.runtime.id}/assets/js/pip-canvas/PipCanvas.mjs`);

	// Get only file name from srcUrl by removing the pageUrl pathname from srcUrl pathname
	const fileName = new URL(onClickedData.srcUrl).pathname.replace(new URL(onClickedData.pageUrl).pathname, "");

	// Get element by src or srcset attributes
	const getImage = src => {
		let image = document.querySelector(`[src='${src}']`);
		if (image) {
			return image;
		}

		image = document.querySelector(`[srcset*='${src}'`);

		// Find adjacent HTMLImageElement in a HTMLPictureElement
		if (image instanceof HTMLSourceElement) {
			const picture = image.closest("picture");
			image = picture.querySelector("img");
		}

		return image;
	};

	// Try the following src patterns to find an element with that source
	const srcset = [
		fileName,
		"./" + fileName,
		"../" + fileName,
		"/" + fileName,
		onClickedData.srcUrl
	];

	// Get image element and open in PIP
	let image = getImage(srcset.find(pred => getImage(pred) !== null));
	mod.then(res => (new res.PipCanvas(image).open()));
}

/*
 * This function will be executed on the new tab created for cross-origin images.
 * It has to be self-contained as the function can not access properties outside
 * its own scope on runtime.
 */
function crossOrigin() {
	if (!document.body) {
		alert("Unsupported image format :(");

		window.close();
		return false;
	}

	const mod = import(`chrome-extension://${chrome.runtime.id}/assets/js/pip-canvas/PipCanvas.mjs`);
	const img = document.getElementsByTagName("img")[0];

	// Load stylesheet
	const style = document.createElement("link");
	style.rel = "stylesheet";
	style.href = `chrome-extension://${chrome.runtime.id}/assets/css/crossOrigin.css`;
	document.head.appendChild(style);

	const html = `
		<div id="interact">
			<h1>to open cross-origin image in PIP</h1>
		</div>
	`;

	mod.then(res => {
		document.body.insertAdjacentHTML("beforeend", html);

		// Wait for interaction so userActivationRequired can settle before PIP invokation
		window.addEventListener("click", () => {
			document.getElementById("interact").remove();
			
			// Open image element in PIP
			const pip = new res.PipCanvas(img);
			pip.open();

			// Close tab when PIP window is closed
			pip.video.addEventListener("leavepictureinpicture", () => window.close());
		}, { once: true });
	});
}

// Get properties of current tab
const tab = async () => {
	const queryOptions = {
		active: true,
		lastFocusedWindow: true
	}

	const tab = await chrome.tabs.query(queryOptions);
	return tab[0];
}

// PIP has been requested for an image
chrome.contextMenus.onClicked.addListener(onClickedData => {
	tab().then(currentTab => {
		const isDataUrl = new RegExp("^\s*data:");

		// Image is not a dataUrl
		if (!isDataUrl.test(onClickedData.srcUrl)) {
			// Image is cross-origin, open it in a new tab
			if (new URL(currentTab.url).origin !== new URL(onClickedData.srcUrl).origin) {
				chrome.tabs.create({
					url: onClickedData.srcUrl
				},
				(newTab) => {
					chrome.scripting.executeScript({
						target: { tabId: newTab.id },
						func: crossOrigin
					});
				});

				return false;
			}
		}

		// Image is same-origin or dataUrl
		chrome.scripting.executeScript({
			target: { tabId: currentTab.id },
			func: createImagePip,
			args: [onClickedData]
		});
	});
});

// Add trigger button in Chrome context menu for images
chrome.runtime.onInstalled.addListener(() => {
	chrome.contextMenus.create({
		"title": "Open image in Picture-in-Picture",
		"contexts": ["image"],
		"id": "image-pip"
	});
});