(function Main() {
	/* detect d3 */
	if (typeof(d3) === "undefined") {
		document.getElementById("path_length").innerHTML = "Please connect to the Internet and reload this page to load the d3.js library required for graphics on this page. If you are already connected to the Internet, there may be a problem with this page. Contact tobiasestime@gmail.com."
		return;
	}
	
	/* Board - singleton containing board cells and other properties */
	var Board = (function() {
		var boardInstance;
		/* init returns publicly accessible properties and methods */
		function init(dimension, cellSize, spacing) {
			return {
				dimension: dimension || 10,	/* number of cells in each board dimension */
				cellSize: cellSize || 30,	/* individual cell size */
				spacing: spacing || 2,		/* spacing between cells */
				cells: {},					/* cells added to board { id: cell object } */
				addCell: function(cell) {
					/* add cell to cells with cell id as key and cell object as value */
					this.cells[cell.id] = cell;
				},
				getCellByStatus: function(status) {
					var cellId = Object.keys(this.cells).find(function(id) {
						/* find the id of the first cell with status */
						return boardInstance.cells[id].status === status;
					});
					return this.cells[cellId];
				},
				plot: function(factor) {
					/* return values for sizing board and placing cells graphically based on index within board */
					return factor * this.cellSize + ((factor + 1) * this.spacing);
				},
				clear: function(openOnly, callBack) {
					for (var cell in this.cells) {
						if (openOnly) {
							/* reset open cell and path cell only; see Cell for details */
							if (this.cells[cell].status === cellStatus[1]) {
								this.cells[cell].degree = Infinity;
							} else if (this.cells[cell].status === cellStatus[4]) {
								this.cells[cell].changeStatus(cellStatus[1]);
							}
						} else {
							/* set all cell status to open */
							this.cells[cell].changeStatus(cellStatus[1]);
						}
					}
					if (callBack) {
						/* clearing changes to DOM elments - implemented as callback to abscract away from object */
						callBack();
					}
				}
			}
		}
		/* single method to access for creating and returning the board instance from init */
		return {
			get: function(setSvg, dimension, cellSize, spacing) {
				if (!boardInstance) {
					/* if the board has not been instantiated, instantiate it */
					boardInstance = init(dimension, cellSize, spacing);
					boardInstance.size = boardInstance.plot(boardInstance.dimension);
					/* set graphical representation of board via callback function, which must return an svg element */
					boardInstance.svg = setSvg(boardInstance.size);
				}
				return boardInstance;
			}
		};
	})();

	/* all possible statuses for cells (correspond to css classes); closed cells are obstacles */
	const cellStatus = [ "closed", "open", "start", "end", "path" ];

	/* Cell - added to board and mutated based on user input */
	function Cell(board, x, y) {
		/* verify argument types */
		if (typeof(board.svg) !== "object" || typeof(x) !== "number" || typeof(y) !== "number")
			throw "Board svg object must be defined and x and y must be numbers";
		/* add rect element to svg for board, specify attributes, and handle click events */
		var rect = board.svg.append("rect").attr({
			"id": "x" + x + "y" + y,	/* id is a function of cell index on board */
			"class": cellStatus[1],
			"height": board.cellSize,
			"width": board.cellSize,
			"x": board.plot(x),			/* compute graphical coordinates based on index */
			"y": board.plot(y)
		}).on("click", function() {
			/* remove any existing paths */
			board.clear(true, clearDomElements);
			/* default to open cell status */
			var setStatus = cellStatus[1],
				startCell = board.getCellByStatus(cellStatus[2]),
				endCell = board.getCellByStatus(cellStatus[3]);
			/* if shift key is depressed, remove existing start cell */
			if (d3.event.shiftKey) {
				if (startCell) {
					startCell.changeStatus(setStatus);
				}
				/* set as start cell */
				setStatus = cellStatus[2];
			}
			/* if alt key is depressed, remove existing end cell */
			if (d3.event.altKey) {
				if (endCell) {
					endCell.changeStatus(setStatus);
				}
				/* set as end cell */
				setStatus = cellStatus[3];
			}
			/* if cell is open, close cell */
			if (this.status === setStatus) {
				setStatus = cellStatus[0];
			}
			/* apply status to cell */
			this.changeStatus(setStatus);
		});
		rect.node().index = [x, y];				/* indices - not graphical positions of rect */
		rect.node().status = cellStatus[1];		/* default to open */
		rect.node().getNeighbors = getNeighbors;
		rect.node().changeStatus = changeStatus;
		rect.node().degree = Infinity;			/* degree - number of cells away from the start cell - to be calculated */
		/* return rect object as cell object */
		return rect.node();
	}
	
	/* change cell status */
	function changeStatus(status) {
		this.status = status;
		/* set degree for start cell to 0; otherwise it is uncalculated */
		this.degree = status === cellStatus[2] ? 0 : Infinity;
		/* change the css class of the cell to indicate status */
		d3.select(this).attr("class", status);
	}

	/* based on the board, return a cell's neighbors */
	function getNeighbors(board, queensCase) {
		var index = this.index, neighbors = [], neighborIds = [];
		/* calculate neighbor bounds */
		var xMax = index[0] + 1, yMax = index[1] + 1, xMin = index[0] - 1, yMin = index[1] - 1;
		/* possible north, south, east, and west neighbors */
		neighbors[0] = [index[0], yMin];
		neighbors[1] = [index[0], yMax];
		neighbors[2] = [xMax, index[1]];
		neighbors[3] = [xMin, index[1]];
		/* possible diagonals - ne, se, sw, nw - considered when using queen's contiguity */
		if (queensCase) {
			neighbors[4] = [xMax, yMin];
			neighbors[5] = [xMax, yMax];
			neighbors[6] = [xMin, yMax];
			neighbors[7] = [xMin, yMin];
		}
		/* compute ids for possible neighbors */
		var neighborIds = neighbors.map(function(index) {
			return "x" + index[0] + "y" + index[1];
		});
		/* filter out start, closed, and non-existent cells */
		neighborIds = neighborIds.filter(function(id) {
			if (id in board.cells) {
				return (board.cells[id].status === cellStatus[1] || board.cells[id].status === cellStatus[3]);
			}
			return false;
		});
		/* return cells for real and viable neighbors */
		return neighborIds.map(function(id) {
			return board.cells[id];
		});
	}

	/* recursively finds path from start cell to end cell */
	function findShortestPath(board, contiguity, degree, neighborMatrix) {
		var previousNeighbors = neighborMatrix[degree - 1];
		/* return if there are no neighbors left and no end has been found */
		if (previousNeighbors.length === 0) {
			document.getElementById("path_length").innerHTML = "no viable path";
			return;
		}
		/* return the end cell if it exists in the previous set of neighbors */
		var endCell = previousNeighbors.find(function(neighbor) {
			return neighbor.status === cellStatus[3];
		});
		/* base case when the end cell is found */
		if (endCell) {
			/* recursively trace steps back to start cell from end cell */
			function lastCell(cell, degree) {
				/* neighbors of cell */
				var neighbors = cell.getNeighbors(board, contiguity).filter(function(neighbor) {
					/* get neighbors with degree one less than previous one */
					return neighbor.degree === degree - 1;
				});
				/* randomize array of neighbors to select a random path in case of ties */
				neighbors.sort(function(a, b) { return 0.5 - Math.random(); });

				/* base case - cells that are 1 degree from start cell do not meet filter requirement */
				if (neighbors[0]) {
					/* change cell status to path */
					neighbors[0].changeStatus(cellStatus[4]);
					/* recurse to next cell with decremented degree */
					lastCell(neighbors[0], --degree);
				}
			}

			lastCell(endCell, degree);
			/* endCell degree is not set to degree to avoid resetting when running consecutive cases */
			/* display path length */
			document.getElementById("path_length").innerHTML = "path length: " + (degree - 1);
			return;
		}
		/* add next array to neighbor matrix (multi-dimensional array); each array represents the neighbors of the starting cell that are "i" degrees away */
		neighborMatrix[degree] = [];
		var previousIds = previousNeighbors.map(function(neighbor) { return neighbor.id; });
		var nextNeighbors;
		/* cycle through previous neighbors (already in array); add neighbor's neighbor to the next neighbor array */
		previousNeighbors.forEach(function(neighbor) {
			/* only consider neighbors with higher degrees, assign the cell the lower degree */
			if (neighbor.degree > degree) {
				neighbor.degree = degree;
				/* get neighbor's neighbors */
				nextNeighbors = neighbor.getNeighbors(board, contiguity);
				/* filter out previously added neighbors */
				nextNeighbors = nextNeighbors.filter(function(next) {
					return previousIds.indexOf(next.id) === -1 && next.degree > degree
				});
				/* add the next neighbors for each neighbor */
				neighborMatrix[degree] = neighborMatrix[degree].concat(nextNeighbors);
			}
		});
		/* recurse to the current neighbors' neighbors, incrementing degree */
		findShortestPath(board, contiguity, ++degree, neighborMatrix);
	}

	/* event handler for button click to find shortest path */
	function runCase() {
		/* remove degrees from previous pathfinding */
		board.clear(true, clearDomElements);
		/* get contiguity based on button clicked */
		var contiguity = this.id === "queen" ? true : false;
		/* if start and end cells are defined start pathfinding */
		var startingCell = board.getCellByStatus(cellStatus[2]);
		if (startingCell && board.getCellByStatus(cellStatus[3])) {
			/* get neighbors for starting cell as element 0 of multidimensional array corresponding to degrees from starting cell */
			var startingNeighbors = [startingCell.getNeighbors(board, contiguity)];
			findShortestPath(board, contiguity, 1, startingNeighbors);
		} else {
			return;
		}
		toggleButton(this);
	}

	/*
	A simpler, abandoned function for finding cell degrees. This approach performs numerous unnecessary calculations.
	Board.prototype.pathLength = function(contiguity) {
		var startCell = this.getCellByStatus(cellState[2]);
		var endCell = this.getCellByStatus(cellState[3]);

		function path(board, currentCell, degree) {
			var neighbors = currentCell.getNeighbors(board, contiguity);
			degree++;
			neighbors.forEach(function(n) {
				if (n.degree > degree) {
					n.degree = degree;
					path(board, n, degree);
				}
			});
		}
		if (startCell && endCell) {
			path(this, startCell, 0);
		}
	}
	*/

	/* Board will throw exception if argument for setting svg is not function; Cell will throw exception if any argument is not valid */
	try {
		/* instantiate board with default dimensions, passing in callback to define svg */
		var board = Board.get(function(size) {
			return d3.select("svg").attr({
				"height": size,
				"width": size
			});
		});
		/* add cells iteratively, placing cells as function of x and y indicies on board */
		var x, y;
		for (x = 0; x < board.dimension; x++) {
			for (y = 0; y < board.dimension; y++) {
				board.addCell(Cell(board, x, y));
			}
		}
	}
	catch(ignore) {
		/* ignore error message; let user know something went wrong */
		document.getElementById("path_length").innerHTML = "Sorry, something went wrong while loading this widget.";
	}

	/* toggle button colors for case - done without adding jQuery or other libraries for size */
	function toggleButton(button) {
		var otherButtons = document.getElementsByClassName("case"), otherId, other;
		for (other in otherButtons) {
			otherId = otherButtons[other].id;
			if (otherId) {
				if (otherId !== button.id) {
					otherButtons[other].style.backgroundColor = "#fff";
					otherButtons[other].style.color = "#7e3f00";
				}
			}
		}
		if (button) {
			button.style.backgroundColor = "#7e3f00";
			button.style.color = "#fff";
		}
	}

	/* run after clearing the svg elements on the board */
	function clearDomElements() {
		document.getElementById("path_length").innerHTML = "\u00A0";
		toggleButton(false);
	}

	/* controls - clear board, random setup, rook's case, queen's case */
	document.getElementById("clear").onclick = function() {
		board.clear(false, clearDomElements);
	}

	/* random integers for random function */
	function getRandInt(shift, maxExclusive) {
		return Math.floor((Math.random() * maxExclusive) + shift);
	}

	document.getElementById("random").onclick = function() {
		board.clear(false, clearDomElements);
		var cell, counter = 0, counterMax = getRandInt(1, board.dimension);
		/* open or close cells a random number of cells randomly */
		for (cell in board.cells) {
			if (counter % counterMax === 0) {
				board.cells[cell].changeStatus(cellStatus[getRandInt(0, 2)]);
			}
			counter++;
		}
		/* return a random cell id for start and end cells */
		function randId() {
			return "x" + getRandInt(0, board.dimension) + "y" + getRandInt(0, board.dimension);
		}
		var randStartId = randId(), randEndId = randId();
		/* avoid collisions between start and end cells */
		while (randStartId === randEndId) {
			randEndId = randId();
		}
		/* set start and end cells */
		board.cells[randStartId].changeStatus(cellStatus[2]);
		board.cells[randEndId].changeStatus(cellStatus[3]);
	}

	document.getElementById("rook").onclick = runCase;

	document.getElementById("queen").onclick = runCase;
})();