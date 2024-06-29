
"use strict";

let app = {
	barcode_detector: null,
	is_decoding: false,
	interval: 1000,	// 1000/30fps=33ms, 1000/20fps=50ms
	interval_id: 0,
	video_elem: null,
	overlays: [],
	scan_code: 0,
	scan_time: 0,
	scan_count: 0,
	loc: "",
	row: ""
}
const SCAN_STALE = 1000
const OVERLAYS_COUNT = 3


init()

async function init() {
	
	document.querySelector("#capture-button").addEventListener("click", capture_onclick)
	document.querySelector("#menu-button").addEventListener("click", menu_onclick)
	document.querySelector("#light-button").addEventListener("click", light_onclick)
	document.querySelector("#dark-button").addEventListener("click", dark_onclick)
	document.querySelector("#clear-location-button").addEventListener("click", clear_loc_onclick)
	document.querySelector("#clear-row-button").addEventListener("click", clear_row_onclick)
	document.querySelector("#clear-all-button").addEventListener("click", clear_all_onclick)
	document.querySelector("#camera-select").addEventListener("change", source_onchange)
	document.querySelector("#display > video").addEventListener("loadeddata", device_onloadeddata, false)
	document.querySelector("#loc-select").addEventListener("change", location_onchange)
	document.querySelector("#row-select").addEventListener("change", location_onchange)
	document.querySelector("#share-button").addEventListener("click", share_onclick)
	document.querySelector("#add-button").addEventListener("click", add_onclick)
	app.video_elem = document.querySelector("#display > video")

	app.loc = localStorage.getItem("loc")
	app.loc = ( app.loc === null ? "" : app.loc )

	app.row = localStorage.getItem("row")
	app.row = ( app.row === null ? "" : app.row )

	init_locations()


	if(app.loc === "") {
		let loc_elem = document.querySelector("#loc-select")
		app.loc = loc_elem[loc_elem.selectedIndex].value
	}

	if(app.row === "") {
		let row_elem = document.querySelector("#row-select")
		app.row = row_elem[row_elem.selectedIndex].value
	}

	content_update()


	app.overlays = init_overlays(OVERLAYS_COUNT)

	let barcode_detector_supported = false
	if('BarcodeDetector' in window) {
		let formats = await window.BarcodeDetector.getSupportedFormats()
		if (formats.length > 0) {
			barcode_detector_supported = true
		}
	}

	if(barcode_detector_supported === true) {
		console.info('Barcode Detector supported!')
	}
	else {
		console.info('Barcode Detector is not supported by this browser, using the Dynamsoft Barcode Reader polyfill?')
		app.interval = 1000

		// BarcodeDetectorPolyfill.setLicense("DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAxLTE2NDk4Mjk3OTI2MzUiLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSIsInNlc3Npb25QYXNzd29yZCI6IndTcGR6Vm05WDJrcEQ5YUoifQ==")
		// let reader = await BarcodeDetectorPolyfill.init()
		// window.BarcodeDetector = BarcodeDetectorPolyfill
		// console.log(reader)
  	}
  
	if(typeof window.BarcodeDetector !== "undefined") {
		app.barcode_detector = new window.BarcodeDetector()
	}
	devices_enum_and_play()
}


function init_locations() {

	let locs = [ "100", "118", "119", "119A", "119B", "119C" ]
	let loc_elem = document.querySelector("#loc-select")

	for(let loc of locs) {
		let option = document.createElement("option")
		option.value = loc
		option.text = loc
		if(loc == app.loc) option.selected = true
		loc_elem.appendChild(option)
	}

	let rows = []
	for(let i=1; i<100; i++) rows.push(i)
	for(let i=65; i<65+26; i++) rows.push(String.fromCharCode(i))
	rows.push("TR")
	
	let row_elem = document.querySelector("#row-select")

	for(let row of rows) {
		let option = document.createElement("option")
		option.value = row
		option.text = row
		if(row == app.row) option.selected = true
		row_elem.appendChild(option)
	}

	let loc = loc_elem[loc_elem.selectedIndex].value
	let row = row_elem[row_elem.selectedIndex].value

	app.loc = loc
	app.row = row
}


function init_overlays(count) {

	let overlays = []
	let overlays_svg = document.querySelector("#display > svg")

	for(let i=0; i<count; i++) {

		let polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon")
		polygon.setAttribute("points", "")
		polygon.setAttribute("class", "barcode-polygon")

		let rect = document.createElementNS("http://www.w3.org/2000/svg", "rect")
		rect.setAttribute("class", "barcode-rect")
		rect.setAttribute("x", -9999)
		rect.setAttribute("y", 0)

		let text = document.createElementNS("http://www.w3.org/2000/svg", "text")
		text.setAttribute("class", "barcode-text")
		text.setAttribute("x", -9999)
		text.setAttribute("y", 0)

		let overlay = { "polygon": polygon, "rect": rect, "text": text }
		overlays.push(overlay)
		overlays_svg.append(polygon)
		overlays_svg.append(rect)
		overlays_svg.append(text)
	}

	return overlays
}


async function devices_enum_and_play() {

	const camera_select = document.querySelector("#camera-select")
	camera_select.innerHTML = ""

	let devices = await navigator.mediaDevices.enumerateDevices()
	let count = 0
	const device_list = []
	for(const device of devices) {
		if(device.kind == "videoinput") {
			const caps = device.getCapabilities()
			const label = device.label || `Camera ${count}`
			device_list.push({"label": label, "caps": caps, "count": count})
			// console.log({"label": label, "caps": caps, "count": count})
			count++
		}
	}

	device_list.sort((a, b) => {
		const order_a = a.count + (a.caps.facingMode[0] === "environment" ? -100 : 0)
		const order_b = b.count + (b.caps.facingMode[0] === "environment" ? -100 : 0)
		return order_a + order_b
	})

	for(const device of device_list) {
		camera_select.add(new Option(device.label, device.caps.deviceId))
	}

	if(count > 0) {
		let device_id = camera_select.selectedOptions[0].value
		device_play(device_id)
	}
	else {
		alert("No camera detected.")
	}
}


function device_onloadeddata(evt) {

	const svg_elem = document.querySelector("#display > svg")
	svg_elem.setAttribute("viewBox",`0 0 ${app.video_elem.videoWidth} ${app.video_elem.videoHeight}`)

	const video_elem = document.querySelector("#display > video")
	svg_elem.style.width = `${video_elem.clientWidth}px`
	svg_elem.style.height = `${video_elem.clientHeight}px`

	clearInterval(app.interval_id)
	app.interval_id = setInterval(device_decode, app.interval)
	console.info("Video loaded.")
	// console.log(evt)
}


async function device_decode() {

	if(app.barcode_detector === null) return
	if(app.is_decoding === true) return

	app.is_decoding = true
	let barcodes = []
	try {
		barcodes = await app.barcode_detector.detect(app.video_elem)
	}
	catch(e) {
		console.error('detect', e, e.stack)
	}
	overlays_update(barcodes)

	if(barcodes.length > 0) {
		app.scan_code = barcodes[0].rawValue
		app.scan_time = Date.now()
	}
	else if(Date.now() - app.scan_time > SCAN_STALE) {
		app.scan_code = 0
	}

	app.is_decoding = false
}


async function device_play(device_id) {

	if(app.video_elem.srcObject !== null) {
		await device_stop()
	}

	const constraints = { video: {deviceId: device_id} }

	try {
		let stream = await navigator.mediaDevices.getUserMedia(constraints)
		app.video_elem.srcObject = stream
	}
	catch(e) {
		console.error('getUserMedia', e, e.stack)
	}
}


async function device_stop() {

	clearInterval(app.interval_id);
	if(app.video_elem.srcObject === null) {
		console.info("No device to stop")
		return
	}

	try{
		let tracks = app.video_elem.srcObject.getTracks()
		for(let track of tracks) {
			track.stop()
		}
	}
	catch(e) {
		console.error('getTracks', e, e.stack)
	}
}


function overlays_update(barcodes) {

	let overlay_index = 0
	for(const barcode of barcodes) {

		if(overlay_index >= app.overlays.length) break

		const overlay = app.overlays[overlay_index]

		const p = barcode.cornerPoints
		const points = `${p[0].x},${p[0].y} ${p[1].x},${p[1].y} ${p[2].x},${p[2].y} ${p[3].x},${p[3].y}`

		overlay.polygon.setAttribute("points", points)
		
		let pts = [p[0], p[1], p[2], p[3]]
		pts.sort((a, b) => (a.y - b.y) - (b.x - a.x))
		const pt = pts[0]

		overlay.text.innerHTML = barcode.rawValue
		overlay.text.setAttribute("x", pt.x)
		overlay.text.setAttribute("y", pt.y - 5)
		
		const bbox = overlay.text.getBoundingClientRect()
		overlay.rect.setAttribute("x", pt.x)
		overlay.rect.setAttribute("y", pt.y - bbox.height)
		overlay.rect.setAttribute("width", bbox.width)
		overlay.rect.setAttribute("height", bbox.height)

		overlay_index++
		if(overlay_index >= OVERLAYS_COUNT) break;
	}

	for(let i=overlay_index; i<OVERLAYS_COUNT; i++) {
		const overlay = app.overlays[overlay_index]
		if(overlay.text.getAttribute("x") !== -9999) {
			overlay.polygon.setAttribute("points", "")
			overlay.rect.setAttribute("x", -9999)
			overlay.text.setAttribute("x", -9999)
		}
	}
}


function content_update() {

	let key = `${app.loc}-${app.row}`
	let items = localStorage.getItem(key)

	document.querySelector("#location-content").innerHTML = ""
	let scan_list = []
	
	if(items !== null) {
		scan_list = items.split(",")
	}

	for(let scan_code of scan_list) {
		content_append(scan_code)
	}

	app.scan_count = scan_list.length
	document.querySelector("#count").innerHTML = `${app.scan_count}`
}


function content_append(scan_code) {

	let container = document.createElement("div")
	container.addEventListener("click", item_click)

	let elem = document.createElement("div")
	elem.innerHTML = scan_code

	let icon = document.createElement("span")
	icon.classList.add("material-symbols-outlined")
	icon.dataset["scan_code"] = scan_code
	icon.innerHTML = "cancel"
	icon.addEventListener("click", item_remove_onclick)

	let spacer = document.createElement("span")
	spacer.classList.add("spacer")

	container.append(spacer)
	container.append(elem)
	container.append(icon)

	document.querySelector("#location-content").append(container)
}


function capture_onclick(evt) {

	console.info("Capture click.")

	app.scan_code = Math.floor(Math.random() * 9999999).toString().padStart(7, '0')

	if(app.scan_code !== 0) {

		let key = `${app.loc}-${app.row}`
		let current = localStorage.getItem(key)
		if(current !== null) {
			current = current.split(",")
		}
		else {
			localStorage.setItem(key, "")
			current = []
		}
		current.push(app.scan_code)
		// content_update(current)

		current = current.join(",")
		localStorage.setItem(key, current);
	
		content_append(app.scan_code)

		app.scan_count++
		document.querySelector("#count").innerHTML = `${app.scan_count}`

		// scroll
		let container = document.querySelector("#location-content")
		let elems = container.childNodes
		
		if(elems.length > 4) {
			let panel = document.querySelector(".content-panel")
			let elem = elems[elems.length - 4]
			let ebbox = elem.getBoundingClientRect()
			let pbbox = panel.getBoundingClientRect()
			let offset = ebbox.top + panel.scrollTop - pbbox.top
			panel.scrollTo({ top: offset, left: 0, behavior: "smooth" })
		}
	}
}


function source_onchange(evt){

	let camera_select = evt.currentTarget
	let device_id = camera_select.selectedOptions[0].value
	device_play(device_id);
}


function menu_onclick(evt) {

    const settings_elem = document.getElementById("settings")
    const button_elem = document.querySelector("#menu-button > span")

    if(settings_elem.classList.contains("active") === true) {
        settings_elem.classList.remove("active")
		button_elem.innerHTML = "menu_open"
		console.info(`Menu show.`)
    }
    else {
        settings_elem.classList.add("active")
		button_elem.innerHTML = "close"
		console.info(`Menu hide.`)
    }
}


function light_onclick(evt) {
	console.info("Enabling light mode.")
	document.body.classList.remove("dark")
	document.body.classList.add("light")
}


function dark_onclick(evt) {
	console.info("Enabling dark	mode.")
	document.body.classList.remove("light")
	document.body.classList.add("dark")
}


function location_onchange(evt) {

	let loc_elem = document.querySelector("#loc-select")
	app.loc = loc_elem[loc_elem.selectedIndex].value

	let row_elem = document.querySelector("#row-select")
	app.row = row_elem[row_elem.selectedIndex].value
	
	localStorage.setItem("loc", app.loc)
	localStorage.setItem("row", app.row)

	content_update()
	console.info(`Location changed to ${app.loc}-${app.row}.`)
}


function clear_loc_onclick(evt) {
	console.info(`Clear current location ${app.loc}.`)
	
	for (let i=0; i<localStorage.length; i++) {
		let key = localStorage.key(i)
		let loc = key.split("-")
		loc = (loc.length == 2 ? loc[0] : "")
		if(loc === app.loc) {
			localStorage.removeItem(key)
		}
	}

	content_update()
}


function clear_row_onclick(evt) {
	console.info(`Clear current row ${app.row}.`)
	let key = `${app.loc}-${app.row}`
	localStorage.removeItem(key)

	content_update()
}


function clear_all_onclick(evt) {
	console.info("Clear all.")

	while (localStorage.length > 0) {
		let key = localStorage.key(0)
		localStorage.removeItem(key)
	}
	content_update()
}


async function share_onclick(evt) {


	let share_file =  generate_file()
	let share_obj = {
		title: "test",
		files: [share_file],
		text: "This might be of interest!"
	}

	if(navigator.canShare(share_obj) !== true) {
		console.info("Sharing CSV file not available.")
		document.querySelector("#credits").innerHTML = "Sharing CSV file not available."
		return
	}

	try {
		await navigator.share(share_obj)
		document.querySelector("#credits").innerHTML = "Shared successfully."
		console.info("Shared successfully.")
	}
	catch (err) {
		console.error(`Error: ${err}`)
	}
}


function generate_file() {

	console.info("Generating CSV file.")

	const FIELD_SEPARATOR = ","
	const LINE_SEPARATOR = "\n"

	let csv = ""

	for (let i=0; i<localStorage.length; i++) {

		let key = localStorage.key(i)
		let parts = key.split("-")
		let loc = (parts.length == 2 ? parts[0] : "")

		if(loc !== "") {
			let row = parts[1]
			let data = localStorage.getItem(key)
			data = data.split(",")
			for(let item of data) {
				csv += `"${loc}"${FIELD_SEPARATOR}"${row}"${FIELD_SEPARATOR}"${item}"${LINE_SEPARATOR}`
			}
		}
	}

	let file =  new File([csv], "data.csv", { type: "text/csv" })
	return file
}


function item_click(evt) {

	let target = evt.currentTarget
	if(target.classList.contains("active")) {
		target.classList.remove("active")
		return
	}

	let elems = document.querySelectorAll("#location-content > div")

	for(let elem of elems) {
		elem.classList.remove("active")
	}

	evt.currentTarget.classList.add("active")
}


function item_remove_onclick(evt) {

	let scan_code = evt.currentTarget.dataset["scan_code"]

	let key = `${app.loc}-${app.row}`
	let data = localStorage.getItem(key)
	if(data === null) return

	data = data.split(",")
	let index = data.indexOf(scan_code)
	if(index === -1) return

	data.splice(index, 1)
	data.join("'")
	localStorage.setItem(`${app.loc}-${app.row}`, data)

	console.log(`Remove ${scan_code} from ${app.loc}-${app.row}`)
	content_update()
}


function add_onclick(evt) {

	app.scan_code = "???????"

	let key = `${app.loc}-${app.row}`
	let current = localStorage.getItem(key)
	if(current !== null) {
		current = current.split(",")
	}
	else {
		localStorage.setItem(key, "")
		current = []
	}
	current.push(app.scan_code)
	current = current.join(",")
	localStorage.setItem(key, current);

	content_append(app.scan_code)

	app.scan_count++
	document.querySelector("#count").innerHTML = `${app.scan_count}`

	app.scan_code = 0
}