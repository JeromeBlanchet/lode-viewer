import { Templated, Core, Net, Util, Dom, Store, Other, Factory } from './web-mapping-components/web-mapping-components.js';
import Table from "./table.js";
import Workaround from "./workaround.js";

/**
 * Main application class
 * @class
 */
export default class LodeApp extends Templated {

	/**
	 * Lode App class constructor
	 * @constructor
	 * @param {object} node reference to dom element that will contain the lode viewer app
	 * @param {object} config object containing data taken from various configuration json files
	 */
	constructor(node, config) {
		super(node);

		this.config = config;
		this.current = this.config.maps[Store.Map];
		this.maxExtent = [[-162.0, 41.0], [-32.0, 83.5]];

		if (!this.current) this.current = Util.FirstProperty(this.config.maps);

		this.AddMap();
		this.AddSearch();
		this.AddBaseControls();
		this.AddGroup();
		this.AddMenu();

		this.ReloadTable();
	}

	/**
	 * Template for the structure of the application, including;
	 * - instruction divs
	 * - search bar container
	 * - map container
	 * - table container
	 */
	Template() {
		return  "<div handle='presentation' class='instructions'>nls(Map_Presentation_1)</div>" + 
				//"<div handle='presentation' class='instructions'>nls(Map_Presentation_2)</div>" + 
				"<div class='search-container'>" +
					"<span class='wb-inv'>nls(Inv_Search_Instructions)</span>" + 
					"<label class='search-label'>nls(App_Search_Label)" +
						"<div handle='search' class='search'></div>" +
					"</label>" +
					"<div class='inv-container'>" +
						"<a href='#lode-table' class='wb-inv wb-show-onfocus wb-sl'>nls(Inv_Skip_Link)</a>" + 
					"</div>" +
				"</div>" +
				"<div class='map-container'>" +
					"<div handle='map' class='map'></div>" +
				"</div>" +
				"<div class='table-container'>" +
					"<div handle='table' class='table'></div>" +
				"</div>";
	}

	/**
	 * Create and add a map with events handling for user interactions.
	 */
	AddMap() {
		let token;

		try {
			if (this.config.credentials
				&& this.config.credentials.mapbox
				&& this.config.credentials.mapbox.accessToken) {
				token = this.config.credentials.mapbox.accessToken;
			} else {
				throw 'Mapbox access token must be provided in config.credentials.json to generate a map';
			}

			this.map = Factory.Map(this.Node("map"), token, this.current.Style, [Store.Lng, Store.Lat], Store.Zoom);

			// Set the maximum bounds of the map
			this.map.SetMaxBounds(this.maxExtent);

			// Hooking up all events
			this.map.On("StyleChanged", this.OnMapStyleChanged_Handler.bind(this));
			this.map.On("MoveEnd", this.OnMapMoveEnd_Handler.bind(this));
			this.map.On("ZoomEnd", this.OnMapZoomEnd_Handler.bind(this));
			this.map.On("Click", this.OnMapClick_Handler.bind(this));

		} catch (err) {
			console.error(err);
		}
	}

	// Add all data sources defined in the map configuration.
	AddDataSources() {
		let mapDataSources, currentSourceName, currentSourceData, i;
		if (this.current && this.current.DataSources) {
			mapDataSources = this.current.DataSources;
		}

		if (mapDataSources && Array.isArray(mapDataSources) && mapDataSources.length) {
			for (i = 0; i < mapDataSources.length; i += 1) {
				currentSourceName = mapDataSources[i].name;
				currentSourceData = mapDataSources[i].data;
				if (currentSourceName && currentSourceData) {
					this.map.AddSource(currentSourceName, currentSourceData);
					if (currentSourceData.cluster) {
						this.map.AddClusters(
							{
								source: currentSourceName
							}
						);
					}
				}
			}
		}
	}

	// Add all layers defined in the map configuration which have data sources.
	AddLayersWithSources() {
		let mapLayers, currentLayer, i;
		if (this.current && this.current.Layers) {
			mapLayers = this.current.Layers;
		}

		if (mapLayers && Array.isArray(mapLayers) && mapLayers.length) {
			for (i = 0; i < mapLayers.length; i += 1) {
				currentLayer = mapLayers[i];
				if (currentLayer.source) {
					this.map.AddLayer(currentLayer);
				}
			}
		}
	}

	/**
	 * Create and add the following controls to the map
	 * - full screen button
	 * - navigation controls
	 * - scale bar
	 */
	AddBaseControls() {
		var fullscreen = Factory.FullscreenControl(Core.Nls("FullScreen_Title"));
		var navigation = Factory.NavigationControl(false, true, Core.Nls("Navigation_ZoomIn_Title"), Core.Nls("Navigation_ZoomOut_Title"));
		var scale = Factory.ScaleControl("metric");

		this.map.AddControl(fullscreen, "top-left");
		this.map.AddControl(navigation, "top-left");
		this.map.AddControl(scale);
	}

	/**
	 * Create and add a search bar for searching census sub-divisions 
	 */
	AddSearch() {
		this.config.search.items = this.config.search.items.map(i => {
			return { 
				id : i[0], 
				name : i[1],
				label : `${i[1]} (${i[0]})`,
				extent : [[i[2], i[3]], [i[4], i[5]]]
			}
		});

		// Add top-left search bar
		var search = Factory.SearchControl(this.config.search.items, Core.Nls("Search_Placeholder"), Core.Nls("Search_Title"));
		search.Place(this.Node("search"));
		search.On("Change", this.OnSearchChange_Handler.bind(this));
		search.Node("typeahead").Node("input").id = "lode-search";
	}

	/**
	 * Create and add a map legend based on legend items defined in map config document.
	 */
	AddGroup() {
		// Top-right group for legend, etc.		
		this.group = {
			legend : Factory.LegendControl(this.current.Legend, this.current.FullTitle, null, this.current.Subtitle),
			opacity : Factory.OpacityControl(Store.Opacity)
		}

		this.map.AddControl(Factory.Group(this.group));
		
		this.group.legend.On("LegendChange", this.OnLegend_Changed.bind(this));
		this.group.opacity.title = Core.Nls("Toc_Opacity_Title");
		this.group.opacity.label = Core.Nls("Toc_Opacity_Label");
		this.group.opacity.On("OpacitySliderChanged", this.OnOpacitySlider_Changed.bind(this));
	}

	/**
	 * Add a menu to the map with various buttons to control map content
	 */
	AddMenu() {
		// Top-left menu below navigation
		var maps = Factory.MapsListControl(this.config.maps);
		var bookmarks = Factory.BookmarksControl(this.config.bookmarks);

		this.menu = Factory.MenuControl();

		this.map.AddControl(this.menu, "top-left")
		this.menu.AddButton("home", Core.root + "assets/globe.png", Core.Nls("Home_Title"), this.OnHomeClick_Handler.bind(this));
		this.menu.AddPopupButton("maps", Core.root + "assets/layers.png", Core.Nls("Maps_Title"), maps, this.map.Container);
		this.menu.AddPopupButton("bookmarks", Core.root + "assets/bookmarks.png", Core.Nls("Bookmarks_Title"), bookmarks, this.map.Container);
		this.menu.AddButton("help", Core.root + "assets/help.png", Core.Nls("Help_Title"), this.OnHelpClick_Handler.bind(this));
						
		maps.On("MapSelected", this.OnMapSelected_Handler.bind(this));
		bookmarks.On("BookmarkSelected", this.OnBookmarkSelected_Handler.bind(this));
	}

	/**
	 * Empty and reload table contents when map layer dataset is selected.
	 */
	ReloadTable() {
		Dom.Empty(this.Node("table"));

		Net.JSON(`${Core.root}${this.current.TableUrl}`).then(ev => {
			this.current.UpdateTable(ev.result);

			this.table = new Table(this.Node("table"), this.current.Table);
	
			this.table.Node("message").setAttribute("href", "#lode-search");
		});
	}

	/**
	 * Event handler for changing the map legend.
	 * @param {object} ev - Legend change event object containing the state of each legend item
	 */
	OnLegend_Changed(ev) {
		this.map.UpdateMapLayersWithLegendState(this.current.LayerIDs, this.group.legend, Store.Opacity);
    }

	/**
	 * OpacitySliderChanged event handler for when the opacity slider updates.
	 * @param {object} ev - Event object containing details on the opacity slider value
	 */
	OnOpacitySlider_Changed(ev) {		
		Store.Opacity = ev.opacity;
		this.map.UpdateMapLayersWithLegendState(this.current.LayerIDs, this.group.legend, Store.Opacity);
	}

	/**
	 * Event handler for clicking the home menu button, which sets the map
	 * bounds to a Canadian extent.
	 * @param {object} ev - mouse event when clicking on the home menu button
	 */
	OnHomeClick_Handler(ev) {
		this.map.FitBounds([[-173.457, 41.846], [-17.324, 75.848]]);
	}

	/**
	 * Event handler for clicking the help button, which simulates clicking the
	 * how to use button at the top of the application.
	 * @param {object} ev - mouse event when clicking on the help menu button. 
	 */
	OnHelpClick_Handler(ev) {
		window.document.getElementById('wb-auto-2').click();
	}
	
	/**
	 * Event handler for clicking a census metropolitan area listed in the
	 * bookmarks popup list.
	 * @param {object} ev - BookmarkSelected event containing the bookmark
	 * item and extent of the census metropolitan area.
	 */
	OnBookmarkSelected_Handler(ev) {
		this.menu.Button("bookmarks").popup.Hide();

		this.map.FitBounds(ev.item.extent, { animate:false });
	}

	/**
	 * Event handler for clicking a map item listed in the maps popup list.
	 * @param {object} ev - MapSelected event containing the selected map id
	 * and related map configuration.
	 */
	OnMapSelected_Handler(ev) {
		this.menu.Button("maps").popup.Hide();

		Store.Map = ev.id;

		this.current = ev.map;

		// this.Node('instructions').innerHTML = Core.Nls("Map_Description", [this.current.Title]);

		this.map.SetStyle(this.current.Style);

		this.ReloadTable();

		this.group.legend.Reload(this.current.Legend, this.current.FullTitle, this.current.Subtitle);
	}

	/**
	 * Event handler which updates the map to handle clicks, and update the
	 * styling on features on the map 
	 * @param {object} ev - StyleChanged event object.
	 */
	OnMapStyleChanged_Handler(ev) {
		this.map.SetClickableMap();

		// Add data sources
		this.AddDataSources();

		// Add layers which have data sources
		this.AddLayersWithSources();

		// Update styling colour and opacity of layers
		this.map.ApplyLegendStylesToMapLayers(this.current.LayerIDs, this.group.legend);
		this.map.UpdateMapLayersWithLegendState(this.current.LayerIDs, this.group.legend, Store.Opacity);
	}

	/**
	 * Event handler for when the map is panned, which updates the local
	 * storage of the lat/long values with the new map's center point values.
	 * @param {object} ev - MoveEnd event object.
	 */
	OnMapMoveEnd_Handler(ev) {
		Store.Lat = this.map.Center.lat;
		Store.Lng = this.map.Center.lng;
	}

	/**
	 * Event handler for when the map is zoomed, which updates the locally
	 * stored zoom value for the map.
	 * @param {object} ev - ZoomEnd event object.
	 */
	OnMapZoomEnd_Handler(ev) {
		Store.Zoom = this.map.Zoom;
	}

	/**
	 * Event handler for when the map is clicked, which queries map features at
	 * the click location and displays the feature details in a popup.
	 * stored zoom value for the map.
	 * @param {object} ev - Click event object.
	 */
	OnMapClick_Handler(ev) {
		var features = this.map.QueryRenderedFeatures(ev.point, this.current.ClickableLayersIDs);

		if (features.length == 0) return;

		var f = features[0];

		// WORKAROUND to fix fields (there's another one in table.js)
		for (var fld in f.properties) {
			f.properties[fld] = Workaround.FixField(fld, f.properties[fld]);
		}

		// TODO : Handle lookups, string formats
		var html = Other.HTMLize(f.properties, this.current.Fields, Core.Nls("Map_Not_Available"));

		this.map.InfoPopup(ev.lngLat, html);
	}

	/**
	 * Update table with search items, add a boundary line for the census
	 * subdivision extent, and update map bounds with the extent of the 
	 * searched census sub-division.
	 * Assumption : Search will always be by CSD
	 * @param {object} ev - Change event object, containing the search item details
	 */
	OnSearchChange_Handler(ev) {
		var legend = {
			config: [
				{
					color : this.config.search.color,
					value : ["==", ["get", this.config.search.field], ev.item.id]
				}, 
				{
					color : [255, 255, 255, 0]
				}
			]
		};

		this.table.UpdateTable(ev.item);
		this.map.ApplyLegendStylesToMapLayers([this.config.search.layer], legend);
		this.map.FitBounds(ev.item.extent, { padding:30, animate:false });
	}
}
