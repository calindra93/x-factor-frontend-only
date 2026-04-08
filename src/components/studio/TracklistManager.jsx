import React from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Music, GripVertical, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TracklistManager({ tracklist, songs, onUpdateTracklist, onAddSong }) {
  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const items = Array.from(tracklist);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    onUpdateTracklist(items);
  };

  const handleRemove = (songId) => {
    onUpdateTracklist(tracklist.filter(id => id !== songId));
  };

  const trackSongs = tracklist.map(id => songs.find(s => s.id === id)).filter(Boolean);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-white text-sm font-medium">Tracklist</h4>
        <Button
          size="sm"
          variant="outline"
          onClick={onAddSong}
          className="bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 rounded-lg h-7 text-xs"
        >
          <Plus className="w-3 h-3 mr-1" />
          Add Song
        </Button>
      </div>

      {trackSongs.length === 0 ? (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4 text-center">
          <Music className="w-6 h-6 text-gray-600 mx-auto mb-1" />
          <p className="text-gray-500 text-xs">No tracks added yet</p>
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="tracklist">
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                {trackSongs.map((song, index) => (
                  <Draggable key={song.id} draggableId={song.id} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={`bg-white/[0.04] border border-white/[0.06] rounded-lg p-2 flex items-center gap-2 ${
                          snapshot.isDragging ? "shadow-lg" : ""
                        }`}
                      >
                        <div {...provided.dragHandleProps} className="text-gray-500 cursor-grab active:cursor-grabbing">
                          <GripVertical className="w-4 h-4" />
                        </div>
                        <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {song.cover_artwork_url ? (
                            <img src={song.cover_artwork_url} alt={song.title} className="w-full h-full object-cover" />
                          ) : (
                            <Music className="w-3 h-3 text-gray-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-medium truncate">{song.title}</p>
                          <p className="text-gray-500 text-[10px]">
                            {song.status === "recorded" ? "Recorded" : "Unrecorded"}
                            {song.quality > 0 && ` • Q: ${song.quality}`}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRemove(song.id)}
                          className="text-gray-500 hover:text-red-400 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}
    </div>
  );
}