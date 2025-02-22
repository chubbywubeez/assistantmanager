import React, { useState, useEffect } from 'react';
import { DataGridPro } from '@mui/x-data-grid-pro';
import { 
  Box, 
  Typography, 
  Paper, 
  Button, 
  TextField,
  IconButton,
  Tooltip,
  Stack
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FilterListIcon from '@mui/icons-material/FilterList';
import axios from 'axios';

const columns = [
  { 
    field: 'id', 
    headerName: 'ID', 
    width: 70,
    filterable: false 
  },
  {
    field: 'message_content',
    headerName: 'Message',
    width: 400,
    flex: 1,
    editable: true,
    filterOperators: ['contains', 'equals', 'startsWith', 'endsWith'],
  },
  {
    field: 'assistant_name',
    headerName: 'Assistant',
    width: 150,
    editable: true,
    filterOperators: ['equals', 'contains'],
  },
  {
    field: 'timestamp',
    headerName: 'Date',
    width: 200,
    valueGetter: (params) => new Date(params.row.timestamp).toLocaleString(),
    filterOperators: ['after', 'before', 'equals'],
    type: 'dateTime',
  },
  {
    field: 'context',
    headerName: 'Context',
    width: 300,
    flex: 1,
    editable: true,
    filterOperators: ['contains', 'equals', 'startsWith', 'endsWith'],
  },
  {
    field: 'tags',
    headerName: 'Tags',
    width: 150,
    editable: true,
    filterOperators: ['contains', 'equals'],
  },
  {
    field: 'actions',
    headerName: 'Actions',
    width: 100,
    sortable: false,
    filterable: false,
    renderCell: (params) => (
      <Tooltip title="Delete">
        <IconButton
          onClick={() => handleDelete(params.row.id)}
          size="small"
          color="error"
        >
          <DeleteIcon />
        </IconButton>
      </Tooltip>
    ),
  },
];

function LikedMessagesTable() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterModel, setFilterModel] = useState({
    items: [],
  });

  useEffect(() => {
    fetchLikedMessages();
  }, []);

  const fetchLikedMessages = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/likes');
      setRows(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to load liked messages');
      console.error('Error loading liked messages:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`/api/likes/${id}`);
      setRows((prevRows) => prevRows.filter((row) => row.id !== id));
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  };

  const handleEditCommit = async (params) => {
    try {
      await axios.put(`/api/likes/${params.id}`, {
        [params.field]: params.value,
      });
      // Optimistically update the UI
      setRows((prevRows) =>
        prevRows.map((row) =>
          row.id === params.id ? { ...row, [params.field]: params.value } : row
        )
      );
    } catch (error) {
      console.error('Error updating message:', error);
      // Revert changes on error
      fetchLikedMessages();
    }
  };

  const exportToCSV = () => {
    const headers = columns
      .filter((col) => col.field !== 'actions')
      .map((col) => col.headerName)
      .join(',');
    
    const csvRows = rows.map((row) =>
      columns
        .filter((col) => col.field !== 'actions')
        .map((col) => {
          const value = col.valueGetter ? col.valueGetter({ row }) : row[col.field];
          return `"${value?.toString().replace(/"/g, '""')}"`; // Escape quotes and wrap in quotes
        })
        .join(',')
    );

    const csvContent = [headers, ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `liked_messages_${new Date().toISOString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (error) {
    return (
      <Typography color="error" align="center">
        {error}
      </Typography>
    );
  }

  return (
    <Paper elevation={3} sx={{ height: '70vh', width: '100%', p: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">
          Liked Messages Database
        </Typography>
        <Stack direction="row" spacing={2}>
          <Button
            variant="outlined"
            startIcon={<FilterListIcon />}
            onClick={() => {
              const gridApi = document.querySelector('.MuiDataGrid-root').api;
              gridApi?.showFilterPanel();
            }}
          >
            Filter
          </Button>
          <Button
            variant="contained"
            startIcon={<FileDownloadIcon />}
            onClick={exportToCSV}
          >
            Export to CSV
          </Button>
        </Stack>
      </Stack>
      <Box sx={{ height: 'calc(100% - 60px)', width: '100%' }}>
        <DataGridPro
          rows={rows}
          columns={columns}
          pageSize={10}
          rowsPerPageOptions={[10, 25, 50, 100]}
          checkboxSelection
          disableSelectionOnClick
          loading={loading}
          filterModel={filterModel}
          onFilterModelChange={(model) => setFilterModel(model)}
          components={{
            Toolbar: DataGridPro.Toolbar,
          }}
          experimentalFeatures={{ newEditingApi: true }}
          onCellEditCommit={handleEditCommit}
          sx={{
            '& .MuiDataGrid-cell': {
              whiteSpace: 'normal',
              lineHeight: 'normal',
              padding: '8px',
            },
          }}
          initialState={{
            columns: {
              columnVisibilityModel: {
                id: false,
              },
            },
          }}
        />
      </Box>
    </Paper>
  );
}

export default LikedMessagesTable; 